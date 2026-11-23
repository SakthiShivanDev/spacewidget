import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

import 'client_test.dart' show Backend;

void main() {
  test('Apple OAuth persists its provider across restart and exchanges only with Apple', () async {
    final backend = Backend(), store = SpaceMemorySessionStore();
    backend.handle = (request) async {
      if (request.path.endsWith('/start')) {
        expect(Uri.parse(request.path).path, '/runtime/auth/oauth/apple/start');
        return backend.json({
          'success': true,
          'data': {
            'authorizationUrl': 'https://appleid.apple.com/auth/authorize',
          },
        });
      }
      expect(
        Uri.parse(request.path).path,
        '/runtime/auth/oauth/apple/exchange',
      );
      return backend.json({'success': true, 'data': backend.session()});
    };
    SpaceClient makeClient() => SpaceClient(
      baseUrl: 'https://studio.example.com',
      apiKey: 'test-key',
      dio: Dio()..httpClientAdapter = backend,
      sessionStore: store,
      oauthReturnUri: Uri.parse('spacewidget://app/auth-return'),
      platform: SpacePlatform(launch: (_) async => true),
    );
    final first = makeClient();
    await first.services.execute(
      const SpaceRequest(source: 'authApple'),
      operation: 'authApple',
    );
    first.dispose();
    final next = makeClient();
    addTearDown(next.dispose);
    expect(
      await next.handleReturnLink(
        Uri.parse('spacewidget://app/auth-return?oauthCode=one-time'),
      ),
      true,
    );
    expect(next.signedIn, true);
  });
  test(
    'external links require a saved name and host-approved custom scheme',
    () async {
      final backend = Backend(), launched = <Uri>[];
      backend.handle = (request) async {
        expect(Uri.parse(request.path).path, '/runtime/integrations/app-links');
        return backend.json({
          'success': true,
          'data': {
            'links': [
              {'name': 'Support', 'url': 'whatsapp://send?phone=123'},
            ],
          },
        });
      };
      final client = SpaceClient(
        baseUrl: 'https://studio.example.com',
        apiKey: 'test-key',
        dio: Dio()..httpClientAdapter = backend,
        sessionStore: SpaceMemorySessionStore(),
        platform: SpacePlatform(
          allowedAppSchemes: {'whatsapp'},
          launch: (url) async {
            launched.add(url);
            return true;
          },
        ),
      );
      addTearDown(client.dispose);
      expect((await client.openExternalApp('Support')).success, true);
      expect(launched.single.scheme, 'whatsapp');
      await expectLater(client.openExternalApp('Unknown'), throwsStateError);
      final restricted = SpacePlatform(launch: (_) async => true);
      await expectLater(
        restricted.operations['openExternalApp']!(
          const SpaceRequest(
            source: 'openExternalApp',
            data: {'url': 'whatsapp://send'},
          ),
        ),
        throwsFormatException,
      );
      final dangerous = SpacePlatform(
        allowedAppSchemes: {'javascript'},
        launch: (_) async => true,
      );
      await expectLater(
        dangerous.operations['openExternalApp']!(
          const SpaceRequest(
            source: 'openExternalApp',
            data: {'url': 'javascript:alert(1)'},
          ),
        ),
        throwsFormatException,
      );
    },
  );
}
