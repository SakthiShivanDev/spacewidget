import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';
import 'package:video_player_platform_interface/video_player_platform_interface.dart';

class FakeHttp implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode({
        'success': true,
        'data': {'received': true},
      }),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

class FakeVideo extends VideoPlayerPlatform {
  final events = StreamController<VideoEvent>();
  final positions = <Duration>[];
  var disposed = false, played = false;
  @override
  Future<void> init() async {}
  @override
  Future<int?> createWithOptions(VideoCreationOptions options) async => 1;
  @override
  Stream<VideoEvent> videoEventsFor(int playerId) => events.stream;
  @override
  Future<void> dispose(int playerId) async {
    disposed = true;
  }

  @override
  Future<void> setLooping(int playerId, bool looping) async {}
  @override
  Future<void> setVolume(int playerId, double volume) async {}
  @override
  Future<void> setPlaybackSpeed(int playerId, double speed) async {}
  @override
  Future<void> play(int playerId) async {
    played = true;
  }

  @override
  Future<void> pause(int playerId) async {
    played = false;
  }

  @override
  Future<void> seekTo(int playerId, Duration position) async {
    positions.add(position);
  }

  @override
  Future<Duration> getPosition(int playerId) async =>
      positions.isEmpty ? Duration.zero : positions.last;
  @override
  Widget buildViewWithOptions(VideoViewOptions options) => const SizedBox();
}

class FakePreferences implements SharedPreferencesAsync {
  final values = <String, String>{};
  @override
  Future<String?> getString(String key) async => values[key];
  @override
  Future<Set<String>> getKeys({Set<String>? allowList}) async => values.keys
      .where((key) => allowList == null || allowList.contains(key))
      .toSet();
  @override
  Future<void> setString(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test(
    'persistent screen cache is bounded and namespaces clear independently',
    () async {
      final preferences = FakePreferences();
      final first = SpacePreferencesDocumentStore(
        namespace: 'account',
        capacity: 1,
        preferences: preferences,
      );
      final second = SpacePreferencesDocumentStore(
        namespace: 'account:other',
        preferences: preferences,
      );
      await first.write('/a', {'title': 'A'});
      await first.write('/b', {'title': 'B'});
      expect(await first.read('/a'), isNull);
      expect(await first.read('/b'), {'title': 'B'});
      await second.write('/a', {'title': 'Other'});
      await first.clear();
      expect(await first.read('/b'), isNull);
      expect(await second.read('/a'), {'title': 'Other'});
    },
  );

  test('Dio preserves client options and blocks other origins', () async {
    final http = FakeHttp();
    final dio = Dio(
      BaseOptions(
        baseUrl: 'https://api.example.com',
        headers: {'Authorization': 'test-session'},
      ),
    )..httpClientAdapter = http;
    final transport = SpaceDioTransport(dio);
    final result = await transport.call(
      const SpaceRequest(source: '/screen', query: {'id': 42}),
    );
    expect(result['success'], true);
    expect(
      http.requests.single.uri.toString(),
      'https://api.example.com/screen?id=42',
    );
    expect(http.requests.single.headers['Authorization'], 'test-session');
    expect(http.requests.single.followRedirects, false);
    await expectLater(
      transport.call(
        const SpaceRequest(source: 'https://other.example/screen'),
      ),
      throwsFormatException,
    );
    expect(http.requests, hasLength(1));
    dio.close();
  });
  test(
    'files become multipart uploads through the configured Dio client',
    () async {
      final http = FakeHttp();
      final dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'))
        ..httpClientAdapter = http;
      final transport = SpaceDioTransport(dio);
      final result = await transport.upload(
        SpaceRequest(
          source: '/upload',
          method: 'POST',
          data: {
            'files': [
              {
                'name': 'notes.txt',
                'bytes': base64Encode(utf8.encode('hello')),
              },
            ],
            'lesson': '123',
          },
        ),
      );
      expect(result.success, true);
      final form = http.requests.single.data as FormData;
      expect(form.files.single.value.filename, 'notes.txt');
      expect(form.fields.single.value, '123');
      dio.close();
    },
  );
  test('file selection respects size limits and cancellation', () async {
    final platform = SpacePlatform(
      selectFiles: () async => [
        XFile.fromData(Uint8List.fromList([1, 2, 3]), name: 'file.bin'),
      ],
    );
    final result = await platform.operations['pickFiles']!(
      const SpaceRequest(source: 'files'),
    );
    expect(result.success, true);
    expect((result.data['files'] as List).single['size'], 3);
    final small = SpacePlatform(
      maxFileBytes: 1,
      selectFiles: platform.selectFiles,
    );
    await expectLater(
      small.operations['pickFiles']!(const SpaceRequest(source: 'files')),
      throwsStateError,
    );
    final cancelled = SpacePlatform(selectFiles: () async => []);
    expect(
      (await cancelled.operations['pickFiles']!(
        const SpaceRequest(source: 'files'),
      )).cancelled,
      true,
    );
  });
  test('checkout handoff never confirms payment', () async {
    final opened = <Uri>[];
    final platform = SpacePlatform(
      launch: (uri) async {
        opened.add(uri);
        return true;
      },
      allowedWebHosts: {'checkout.example.com'},
    );
    final result = await platform.operations['checkout']!(
      const SpaceRequest(
        source: 'checkout',
        data: {
          'url': 'https://checkout.example.com/session',
          'sessionId': 'session123',
        },
      ),
    );
    expect(opened.single.host, 'checkout.example.com');
    expect(result.success, false);
    expect(result.data['status'], 'pending');
    expect(result.data['sessionId'], 'session123');
    await expectLater(
      platform.operations['checkout']!(
        const SpaceRequest(
          source: 'checkout',
          data: {'url': 'javascript:alert(1)'},
        ),
      ),
      throwsFormatException,
    );
  });
  test('WebSocket decodes live events and closes the connection', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final closed = Completer<void>();
    final connections = server.listen((request) async {
      final socket = await WebSocketTransformer.upgrade(request);
      socket.listen((_) {}, onDone: () => closed.complete());
      socket.add(jsonEncode({'status': 'arriving'}));
    });
    final factory = spaceWebSocketStream(
      endpoint: (_) => Uri.parse('ws://127.0.0.1:${server.port}/live'),
    );
    expect(await factory(const SpaceRequest(source: '/order')).first, {
      'status': 'arriving',
    });
    await closed.future.timeout(const Duration(seconds: 3));
    await connections.cancel();
    await server.close(force: true);
  });
  testWidgets('file picker validates and submits form values', (tester) async {
    final platform = SpacePlatform(
      selectFiles: () async => [
        XFile.fromData(
          Uint8List.fromList([1, 2]),
          name: 'assignment.txt',
          path: 'assignment.txt',
        ),
      ],
    );
    final controller = SpaceController();
    addTearDown(controller.dispose);
    Map<String, dynamic>? saved;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            controller: controller,
            widgets: platform.widgets,
            actions: {'save': (event) => saved = event.values},
            data: {
              'type': 'form',
              'children': [
                {'type': 'filePicker', 'name': 'assignment', 'required': true},
                {
                  'type': 'button',
                  'text': 'Submit',
                  'action': {'type': 'submit', 'name': 'save'},
                },
              ],
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    expect(saved, isNull);
    await tester.tap(find.text('Select files'));
    await tester.pumpAndSettle();
    expect(find.text('assignment.txt'), findsOneWidget);
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();
    expect((saved!['assignment'] as List).single['name'], 'assignment.txt');
  });
  testWidgets('player restores position, plays and disposes its controller', (
    tester,
  ) async {
    final original = VideoPlayerPlatform.instance;
    final fake = FakeVideo();
    VideoPlayerPlatform.instance = fake;
    addTearDown(() => VideoPlayerPlatform.instance = original);
    addTearDown(fake.events.close);
    final controller = SpaceController(initialState: {'position': 12});
    addTearDown(controller.dispose);
    final platform = SpacePlatform();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            controller: controller,
            widgets: platform.widgets,
            data: {
              'type': 'videoPlayer',
              'src': 'https://media.example/video.mp4',
              'positionBind': 'position',
            },
          ),
        ),
      ),
    );
    await tester.pump();
    fake.events.add(
      VideoEvent(
        eventType: VideoEventType.initialized,
        duration: const Duration(minutes: 2),
        size: const Size(640, 360),
      ),
    );
    await tester.pumpAndSettle();
    expect(fake.positions, const [Duration(seconds: 12)]);
    await tester.tap(find.byTooltip('Play'));
    await tester.pump();
    expect(fake.played, true);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump();
    expect(fake.disposed, true);
    expect(tester.takeException(), isNull);
  });
}
