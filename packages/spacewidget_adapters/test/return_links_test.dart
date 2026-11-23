import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

import 'client_test.dart' show Backend;

class _OAuthFormClient extends SpaceClient {
  String? provider;
  Map<String, dynamic>? destination;
  _OAuthFormClient()
    : super(
        baseUrl: 'https://studio.example.com',
        apiKey: 'app-key',
        sessionStore: SpaceMemorySessionStore(),
        dio: Dio()..httpClientAdapter = Backend(),
      );
  @override
  Future<SpaceResult> startOAuthSignIn({
    String provider = 'google',
    Map<String, dynamic>? destination,
  }) async {
    this.provider = provider;
    this.destination = destination;
      return SpaceResult(
      success: false,
      message: 'Continue in the browser',
    );
  }
}

void main() {
  testWidgets(
    'Google button passes the form success destination and bound parameters to OAuth',
    (tester) async {
      final client = _OAuthFormClient();
      addTearDown(client.dispose);
      client.controller.setValue('capabilities.googleOAuth', true);
      client.controller.setValue('section', 'bookings');
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SpaceWidget(
                data: {
                  'type': 'loginForm',
                  'onSuccess': {
                    'type': 'replace',
                    'source': '/runtime/screens/profile',
                    'query': {'section': '{{section}}'},
                  },
                },
                controller: client.controller,
                services: client.services,
                widgets: client.widgets,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue with Google'));
      await tester.pumpAndSettle();
      expect(client.provider, 'google');
      expect(client.destination, {
        'screenId': 'profile',
        'query': {'section': 'bookings'},
      });
      expect(client.signedIn, false);
    },
  );
  test('return links match exact destination and fixed query values, rejecting lookalikes', () {
    final target = Uri.parse(
      'spacewidget://app/payment-return?environment=test',
    );
    expect(
      spaceMatchesReturnUri(
        Uri.parse(
          'spacewidget://app/payment-return?environment=test&orderId=123',
        ),
        target,
      ),
      true,
    );
    for (final uri in [
      'spacewidget://app/payment-return-evil?environment=test',
      'spacewidget://evil/payment-return?environment=test',
      'spacewidget://app/payment-return?environment=live',
      'spacewidget://app/payment-return?environment=test&environment=live',
      'spacewidget://user@app/payment-return?environment=test',
      'spacewidget://app/payment-return?environment=test#fragment',
    ]) {
      expect(spaceMatchesReturnUri(Uri.parse(uri), target), false, reason: uri);
    }
  });
  for (final destination in [
    null,
    {
      'screenId': 'profile',
      'query': {'section': 'bookings'},
    },
  ]) {
    test(
      'OAuth verifier and destination survive app restart: $destination',
      () async {
        final backend = Backend(),
            store = SpaceMemorySessionStore(),
            opened = <Uri>[];
        backend.handle = (request) async {
          if (request.path.endsWith('/start')) {
            final body = request.data as Map;
            expect(
              body['codeChallenge'],
              matches(RegExp(r'^[A-Za-z0-9_-]{43}$')),
            );
            return backend.json({
              'success': true,
              'data': {
                'authorizationUrl': 'https://accounts.google.com/authorize',
              },
            });
          }
          expect(request.path, endsWith('/exchange'));
          expect((request.data as Map)['codeVerifier'], hasLength(43));
          return backend.json({'success': true, 'data': backend.session()});
        };
        SpaceClient makeClient() => SpaceClient(
          baseUrl: 'https://studio.example.com',
          apiKey: 'app-key',
          dio: Dio()..httpClientAdapter = backend,
          sessionStore: store,
          oauthReturnUri: Uri.parse('spacewidget://app/auth-return'),
          platform: SpacePlatform(
            launch: (uri) async {
              opened.add(uri);
              return true;
            },
          ),
        );
        final first = makeClient();
        final pending = await first.services.execute(
          SpaceRequest(source: 'authOAuth', data: destination ?? {}),
          operation: 'authOAuth',
        );
        expect(pending.success, false);
        expect(first.signedIn, false);
        expect(opened.single.host, 'accounts.google.com');
        first.dispose();
        final restarted = makeClient();
        addTearDown(restarted.dispose);
        final destinations = <Map<String, dynamic>>[];
        final sub = restarted.destinations.listen(destinations.add);
        addTearDown(sub.cancel);
        expect(
          await restarted.handleReturnLink(
            Uri.parse('spacewidget://evil/auth-return?oauthCode=opaque'),
          ),
          false,
        );
        expect(
          await restarted.handleReturnLink(
            Uri.parse('spacewidget://app/auth-return?oauthCode=opaque'),
          ),
          true,
        );
        await Future<void>.delayed(Duration.zero);
        expect(restarted.signedIn, true);
        if (destination == null) {
          expect(destinations.single, {
            'source': '/runtime/start',
            'replace': true,
          });
        } else {
          expect(destinations.single, {...destination, 'replace': true});
        }
        expect(
          jsonEncode(restarted.controller.state),
          isNot(contains('access-user-a')),
        );
        expect(
          await restarted.handleReturnLink(
            Uri.parse('spacewidget://app/auth-return?oauthCode=opaque'),
          ),
          false,
        );
      },
    );
  }
  test('payment return requests backend verification and notification routes come from authenticated lookup', () async {
    final backend = Backend(),
        client = SpaceClient(
          baseUrl: 'https://studio.example.com',
          apiKey: 'app-key',
          dio: Dio()..httpClientAdapter = backend,
          sessionStore: SpaceMemorySessionStore(),
          paymentReturnUri: Uri.parse('https://app.example.com/payment-return'),
        );
    addTearDown(client.dispose);
    await client.login(email: 'alice@example.com', password: 'password');
    backend.handle = (r) async {
      expect(r.headers['Authorization'], 'Bearer access-user-a');
      if (r.path.endsWith('/verify')) {
        expect((r.data as Map)['orderId'], 'order-1');
        return backend.json({
          'success': true,
          'data': {
            'order': {'status': 'pending'},
          },
        });
      }
      return backend.json({
        'success': true,
        'data': {
          'screenId': 'order',
          'query': {'orderId': 'order-1'},
        },
      });
    };
    final destinations = <Map<String, dynamic>>[];
    final sub = client.destinations.listen(destinations.add);
    addTearDown(sub.cancel);
    expect(
      await client.handleReturnLink(
        Uri.parse(
          'https://app.example.com/payment-return?orderId=order-1&payment_status=paid',
        ),
      ),
      true,
    );
    expect(await client.openNotification('notification-id'), true);
    await Future<void>.delayed(Duration.zero);
    expect(destinations, hasLength(2));
    expect(destinations.first['query']['orderId'], 'order-1');
    expect(client.controller.read('payment_status'), isNull);
    expect(
      await client.handleReturnLink(
        Uri.parse(
          'https://app.example.com/payment-return?orderId=one&orderId=two',
        ),
      ),
      false,
    );
  });
  test(
    'app-link subscription forwards validated links and cancels on disposal',
    () async {
      final backend = Backend(),
          links = StreamController<Uri>(),
          client = SpaceClient(
            baseUrl: 'https://studio.example.com',
            apiKey: 'app-key',
            dio: Dio()..httpClientAdapter = backend,
            sessionStore: SpaceMemorySessionStore(),
          );
      addTearDown(client.dispose);
      final bridge = SpaceAppLinks(client: client, links: links.stream);
      links.add(Uri.parse('https://unrelated.example.com/'));
      await Future<void>.delayed(Duration.zero);
      expect(backend.calls, isEmpty);
      await bridge.dispose();
      expect(links.hasListener, false);
      await links.close();
    },
  );
}
