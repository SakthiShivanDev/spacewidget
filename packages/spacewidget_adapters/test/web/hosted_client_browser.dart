import 'package:dio/browser.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';
import 'package:spacewidget_adapters/src/hosted_http_web.dart';

void main() {
  const baseUrl = String.fromEnvironment('SPACE_TEST_STUDIO_URL');
  const key = String.fromEnvironment('SPACE_TEST_STUDIO_KEY');

  test('owned web transport silences the preflight notice; supplied Dio keeps its settings', () {
    final owned = createHostedDio();
    addTearDown(() => owned.close(force: true));
    expect(
      (owned.httpClientAdapter as BrowserHttpClientAdapter).enableCORSWarning,
      false,
    );
    final supplied = Dio()
      ..httpClientAdapter = BrowserHttpClientAdapter(enableCORSWarning: true);
    addTearDown(() => supplied.close(force: true));
    final client = SpaceClient(
      baseUrl: 'https://studio.example.com',
      apiKey: 'test-key',
      dio: supplied,
      sessionStore: SpaceMemorySessionStore(),
    );
    addTearDown(client.dispose);
    expect(
      (supplied.httpClientAdapter as BrowserHttpClientAdapter)
          .enableCORSWarning,
      true,
    );
  });

  test('real Chrome cross-origin app-key GET, JSON POST and bearer-token requests succeed; errors remain visible', () async {
    expect(
      baseUrl,
      isNotEmpty,
      reason:
          'Run studio/scripts/test-web-client.mjs to start the isolated API.',
    );
    expect(Uri.base.origin, isNot(Uri.parse(baseUrl).origin));
    final client = SpaceClient(
      baseUrl: baseUrl,
      apiKey: key,
      sessionStore: SpaceMemorySessionStore(),
    );
    addTearDown(client.dispose);
    final screen = await client.services.send(
      const SpaceRequest(source: '/runtime/start'),
    );
    expect(screen['screenId'], 'main');
    final registration = await client.register(
      name: 'Browser user',
      email: 'browser@example.com',
      password: 'browser-test-password',
    );
    expect(registration.success, true);
    final profile = await client.services.send(
      const SpaceRequest(source: '/runtime/screens/profile'),
    );
    expect((profile['state'] as Map)['user']['name'], 'Browser user');
    final invalid = SpaceClient(
      baseUrl: baseUrl,
      apiKey: 'sw_pk_invalid',
      sessionStore: SpaceMemorySessionStore(),
    );
    addTearDown(invalid.dispose);
    await expectLater(
      invalid.services.send(const SpaceRequest(source: '/runtime/start')),
      throwsA(
        isA<DioException>().having(
          (e) => e.response?.statusCode,
          'status',
          401,
        ),
      ),
    );
    await client.logout();
  });
}
