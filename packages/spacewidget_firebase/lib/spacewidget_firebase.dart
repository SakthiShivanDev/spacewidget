library;

import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

/// Opt-in push for a Firebase-initialized host. FCM payloads contain an opaque
/// notificationId; the backend verifies ownership before returning a screen.
class SpaceFirebasePush {
  final SpaceClient client;
  final FirebaseMessaging messaging;
  final String? vapidKey;
  final String? serviceWorkerScriptPath;
  final void Function(Object error)? onError;
  final List<StreamSubscription<dynamic>> _subscriptions = [];
  bool _enabled = false, _disposed = false, _started = false;
  String? _identity;
  String? _token;
  String? _pendingNotification;
  SpaceFirebasePush({
    required this.client,
    FirebaseMessaging? messaging,
    this.vapidKey,
    this.serviceWorkerScriptPath,
    this.onError,
  }) : messaging = messaging ?? FirebaseMessaging.instance;

  Map<String, SpaceOperation> get operations => {
    'pushRegister': (_) async {
      await enable();
      return SpaceResult(success: _enabled, data: {'enabled': _enabled});
    },
    'pushUnregister': (_) async {
      await disable();
      return SpaceResult(success: true);
    },
  };
  Future<void> start() async {
    if (_started || _disposed) return;
    _started = true;
    _identity = client.user?["id"] as String?;
    client.addListener(_sessionChanged);
    _subscriptions.add(
      messaging.onRegistered.listen((token) {
        _token = token;
        if (_enabled) unawaited(_register(token));
      }),
    );
    _subscriptions.add(
      FirebaseMessaging.onMessage.listen((message) {
        if (_disposed) return;
        client.controller.setValue('notifications.last', {
          'id': message.data['notificationId'],
          'title': message.notification?.title,
          'body': message.notification?.body,
        });
      }),
    );
    _subscriptions.add(
      FirebaseMessaging.onMessageOpenedApp.listen(
        (message) => unawaited(_open(message)),
      ),
    );
    final consent = await client.sessionStore.read(
      '${client.integrationNamespace}.push-consent',
    );
    if (consent == 'on' && !_disposed) {
      final permission = await messaging.getNotificationSettings();
      _enabled =
          permission.authorizationStatus == AuthorizationStatus.authorized ||
          permission.authorizationStatus == AuthorizationStatus.provisional;
      if (_enabled) {
        await messaging.register(
          vapidKey: vapidKey,
          serviceWorkerScriptPath: serviceWorkerScriptPath,
        );
      }
    }
    final initial = await messaging.getInitialMessage();
    if (initial != null && !_disposed) await _open(initial);
  }

  Future<void> _open(RemoteMessage message) async {
    final id = message.data['notificationId'];
    if (id is! String || _disposed) return;
    if (!client.signedIn) {
      _pendingNotification = id;
      return;
    }
    try {
      await client.openNotification(id);
    } catch (error) {
      onError?.call(error);
    }
  }

  void _sessionChanged() {
    final identity = client.user?['id'] as String?;
    if (_disposed || identity == _identity) return;
    _identity = identity;
    if (identity != null && _enabled && _token != null) {
      unawaited(_register(_token!));
    }
    if (identity != null && _pendingNotification != null) {
      final id = _pendingNotification!;
      _pendingNotification = null;
      unawaited(
        client.openNotification(id).catchError((Object error) {
          onError?.call(error);
          return false;
        }),
      );
    }
  }

  Future<void> _register(String token) async {
    if (_disposed || !_enabled || !client.signedIn) return;
    try {
      await client.registerPushToken(
        token,
        platform: kIsWeb ? 'web' : defaultTargetPlatform.name,
      );
    } catch (error) {
      onError?.call(error);
    }
  }

  Future<void> enable() async {
    if (_disposed) return;
    if (!_started) await start();
    final permission = await messaging.requestPermission();
    _enabled =
        permission.authorizationStatus == AuthorizationStatus.authorized ||
        permission.authorizationStatus == AuthorizationStatus.provisional;
    if (!_enabled) return;
    await client.sessionStore.write(
      '${client.integrationNamespace}.push-consent',
      'on',
    );
    await messaging.register(
      vapidKey: vapidKey,
      serviceWorkerScriptPath: serviceWorkerScriptPath,
    );
    // onRegistered supplies the current token and all subsequent rotations.
  }

  Future<void> disable() async {
    _enabled = false;
    await client.sessionStore.write(
      '${client.integrationNamespace}.push-consent',
      'off',
    );
    try {
      await client.unregisterPushToken();
    } finally {
      await messaging.unregister();
      _token = null;
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    client.removeListener(_sessionChanged);
    for (final subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
  }
}
