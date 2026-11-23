import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:firebase_messaging_platform_interface/firebase_messaging_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';
import 'package:spacewidget_firebase/spacewidget_firebase.dart';

class _Settings implements NotificationSettings {
  @override
  final AuthorizationStatus authorizationStatus;
  _Settings(this.authorizationStatus);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Messaging implements FirebaseMessaging {
  final registrations = StreamController<String>.broadcast();
  AuthorizationStatus permission = AuthorizationStatus.authorized;
  RemoteMessage? initial;
  int registered = 0, unregistered = 0;
  @override
  Stream<String> get onRegistered => registrations.stream;
  @override
  Future<NotificationSettings> requestPermission({
    bool alert = true,
    bool announcement = false,
    bool badge = true,
    bool carPlay = false,
    bool criticalAlert = false,
    bool provisional = false,
    bool sound = true,
    bool providesAppNotificationSettings = false,
  }) async => _Settings(permission);
  @override
  Future<NotificationSettings> getNotificationSettings() async =>
      _Settings(permission);
  @override
  Future<RemoteMessage?> getInitialMessage() async => initial;
  @override
  Future<void> register({
    String? vapidKey,
    String? serviceWorkerScriptPath,
  }) async {
    registered++;
    registrations.add('firebase-device-token-current');
  }

  @override
  Future<void> unregister() async {
    unregistered++;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Backend implements HttpClientAdapter {
  final calls = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    calls.add(options);
    final data = options.path.endsWith('/auth/login')
        ? {
            'accessToken': 'test-access',
            'refreshToken': 'test-refresh',
            'expiresAt': DateTime.now().millisecondsSinceEpoch + 900000,
            'user': {'id': 'buyer', 'name': 'Buyer'},
          }
        : options.path.contains('/push/notifications/')
        ? {
            'screenId': 'order',
            'query': {'orderId': 'owned-order'},
          }
        : <String, dynamic>{};
    return ResponseBody.fromString(
      jsonEncode({'success': true, 'data': data}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<void> flush() async {
  for (var i = 0; i < 10; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Messaging messaging;
  late _Backend backend;
  late SpaceClient client;
  late SpaceFirebasePush push;
  setUp(() {
    messaging = _Messaging();
    backend = _Backend();
    client = SpaceClient(
      baseUrl: 'https://studio.example.com',
      apiKey: 'app-key',
      sessionStore: SpaceMemorySessionStore(),
      dio: Dio()..httpClientAdapter = backend,
    );
    push = SpaceFirebasePush(client: client, messaging: messaging);
  });
  tearDown(() async {
    await push.dispose();
    client.dispose();
    await messaging.registrations.close();
  });
  test('permission, registration and rotations register tokens, foreground updates stay in app state', () async {
    await client.login(email: 'buyer@example.com', password: 'password');
    await push.start();
    await push.enable();
    await flush();
    expect(
      backend.calls.where((r) => r.path.endsWith('/push/devices')),
      hasLength(1),
    );
    messaging.registrations.add('firebase-device-token-rotated');
    await flush();
    expect(
      backend.calls.where((r) => r.path.endsWith('/push/devices')),
      hasLength(2),
    );
    FirebaseMessagingPlatform.onMessage.add(
      const RemoteMessage(
        data: {'notificationId': 'note-1'},
        notification: RemoteNotification(
          title: 'Order confirmed',
          body: 'Ready',
        ),
      ),
    );
    await flush();
    expect(client.controller.read('notifications.last.id'), 'note-1');
    await push.disable();
    expect(messaging.unregistered, 1);
    expect(
      await client.sessionStore.read(
        '${client.integrationNamespace}.push-consent',
      ),
      'off',
    );
  });
  test('cold notification waits for authentication and navigation survives before host subscription', () async {
    messaging.initial = const RemoteMessage(
      data: {'notificationId': 'note-cold'},
    );
    await push.start();
    expect(backend.calls, isEmpty);
    await client.login(email: 'buyer@example.com', password: 'password');
    await flush();
    expect(
      backend.calls.where(
        (r) => r.path.endsWith('/push/notifications/note-cold'),
      ),
      hasLength(1),
    );
    final destination = await client.destinations.first.timeout(
      const Duration(seconds: 1),
    );
    expect(destination['query']['orderId'], 'owned-order');
  });
  test('denied permission never registers a device', () async {
    messaging.permission = AuthorizationStatus.denied;
    await client.login(email: 'buyer@example.com', password: 'password');
    await push.start();
    await push.enable();
    await flush();
    expect(messaging.registered, 0);
    expect(
      backend.calls.where((r) => r.path.endsWith('/push/devices')),
      isEmpty,
    );
  });
}
