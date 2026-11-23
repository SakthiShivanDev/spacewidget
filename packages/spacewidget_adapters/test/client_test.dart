import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

class Backend implements HttpClientAdapter {
  final calls = <RequestOptions>[];
  Future<ResponseBody> Function(RequestOptions)? handle;
  Map<String, dynamic> session({int? expiresAt, String user = 'user-a'}) => {
    'accessToken': 'access-$user',
    'refreshToken': 'refresh-$user',
    'expiresAt':
        expiresAt ??
        DateTime.now().add(const Duration(minutes: 15)).millisecondsSinceEpoch,
    'user': {'id': user, 'name': 'Alice', 'email': 'alice@example.com'},
  };
  ResponseBody json(Map<String, dynamic> value, [int status = 200]) =>
      ResponseBody.fromString(
        jsonEncode(value),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );
  @override
  Future<ResponseBody> fetch(
    RequestOptions request,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    calls.add(request);
    if (handle != null) return handle!(request);
    if (request.path.contains('/auth/login') ||
        request.path.contains('/auth/register') ||
        request.path.contains('/auth/refresh')) {
      return json({'success': true, 'data': session()});
    }
    if (request.path.contains('/auth/logout')) return json({'success': true});
    return json({
      'success': true,
      'widgets': {'type': 'text', 'text': 'Remote screen'},
    });
  }

  @override
  void close({bool force = false}) {}
}

class DelayedSessionStore extends SpaceMemorySessionStore {
  final started = Completer<void>();
  final release = Completer<void>();
  @override
  Future<void> write(String key, String value) async {
    started.complete();
    await release.future;
    await super.write(key, value);
  }
}

SpaceClient client(
  Backend backend, {
  SpaceSessionStore? store,
  String key = 'sw_pk_test',
}) => SpaceClient(
  baseUrl: 'https://studio.example.com',
  apiKey: key,
  sessionStore: store ?? SpaceMemorySessionStore(),
  dio: Dio()..httpClientAdapter = backend,
);
void main() {
  test('base URL and app key fetch a complete screen; tokens stay outside UI state and results', () async {
    final backend = Backend(), c = client(backend);
    addTearDown(c.dispose);
    await c.initialize();
    await c.services.send(const SpaceRequest(source: '/runtime/start'));
    expect(backend.calls.single.headers['x-space-api-key'], 'sw_pk_test');
    final login = await c.login(
      email: 'alice@example.com',
      password: 'test-password',
    );
    expect(login.success, true);
    expect(c.signedIn, true);
    expect(login.data.containsKey('accessToken'), false);
    expect(login.data.containsKey('refreshToken'), false);
    expect(jsonEncode(c.controller.state), isNot(contains('access-user-a')));
    await c.services.send(
      const SpaceRequest(source: '/runtime/screens/profile'),
    );
    expect(backend.calls.last.headers['Authorization'], 'Bearer access-user-a');
  });
  test('secure-store interface restores sessions and scopes them by server and app key', () async {
    final store = SpaceMemorySessionStore(), backend = Backend();
    final first = client(backend, store: store);
    await first.login(email: 'a@example.com', password: 'test-password');
    first.dispose();
    final restored = client(backend, store: store),
        other = client(backend, store: store, key: 'another-key');
    addTearDown(restored.dispose);
    addTearDown(other.dispose);
    await restored.initialize();
    await other.initialize();
    expect(restored.signedIn, true);
    expect(other.signedIn, false);
    await restored.logout();
    expect(restored.signedIn, false);
    expect(restored.sessionEpoch, 1);
    final after = client(backend, store: store);
    addTearDown(after.dispose);
    await after.initialize();
    expect(after.signedIn, false);
  });
  test(
    'concurrent expired requests share one refresh and do not replay mutations',
    () async {
      final backend = Backend();
      var refreshes = 0;
      final refreshed = Completer<ResponseBody>();
      final started = Completer<void>();
      backend.handle = (request) async {
        if (request.path.endsWith('/auth/login')) {
          return backend.json({
            'success': true,
            'data': backend.session(expiresAt: 0),
          });
        }
        if (request.path.endsWith('/auth/refresh')) {
          refreshes++;
          if (!started.isCompleted) started.complete();
          return refreshed.future;
        }
        return backend.json({
          'success': true,
          'widgets': {'type': 'text', 'text': 'Ready'},
        });
      };
      final c = client(backend);
      addTearDown(c.dispose);
      await c.login(email: 'a@example.com', password: 'test-password');
      final one = c.services.send(const SpaceRequest(source: '/runtime/start'));
      final two = c.services.send(
        const SpaceRequest(source: '/runtime/screens/profile'),
      );
      await started.future.timeout(const Duration(seconds: 3));
      expect(refreshes, 1);
      refreshed.complete(
        backend.json({'success': true, 'data': backend.session()}),
      );
      await Future.wait([one, two]);
      expect(refreshes, 1);
      backend.handle = (r) async =>
          backend.json({'success': false, 'code': 'AUTH_REQUIRED'}, 401);
      await expectLater(
        c.services.send(
          const SpaceRequest(source: '/runtime/actions/save', method: 'POST'),
        ),
        throwsA(isA<DioException>()),
      );
      expect(
        backend.calls.where((r) => r.path.endsWith('/actions/save')),
        hasLength(1),
      );
    },
  );
  test('late refresh completion cannot restore a logged-out session', () async {
    final backend = Backend(), refresh = Completer<ResponseBody>();
    final started = Completer<void>();
    backend.handle = (r) async {
      if (r.path.endsWith('/auth/login')) {
        return backend.json({
          'success': true,
          'data': backend.session(expiresAt: 0),
        });
      }
      if (r.path.endsWith('/auth/refresh')) {
        started.complete();
        return refresh.future;
      }
      return backend.json({
        'success': true,
        'widgets': {'type': 'text', 'text': 'Public'},
      });
    };
    final c = client(backend);
    addTearDown(c.dispose);
    await c.login(email: 'a@example.com', password: 'test-password');
    final pending = c.services.send(
      const SpaceRequest(source: '/runtime/start'),
    );
    await started.future.timeout(const Duration(seconds: 3));
    await c.logout();
    refresh.complete(
      backend.json({'success': true, 'data': backend.session()}),
    );
    await pending;
    expect(c.signedIn, false);
    expect(c.controller.read('auth.signedIn'), false);
  });
  test('logout during session persistence cancels login and deletes the stored session', () async {
    final backend = Backend(), store = DelayedSessionStore();
    final c = client(backend, store: store);
    addTearDown(c.dispose);
    final login = c.login(
      email: 'alice@example.com',
      password: 'test-password',
    );
    await store.started.future.timeout(const Duration(seconds: 3));
    final logout = c.logout();
    store.release.complete();
    expect((await login).cancelled, true);
    await logout;
    expect(c.signedIn, false);
    final restored = client(backend, store: store);
    addTearDown(restored.dispose);
    await restored.initialize();
    expect(restored.signedIn, false);
  });
  test('private-screen authentication challenges show a login form; invalid app keys remain errors', () async {
    final backend = Backend(), c = client(backend);
    addTearDown(c.dispose);
    backend.handle = (r) async =>
        backend.json({'success': false, 'code': 'AUTH_REQUIRED'}, 401);
    final screen = await c.services.send(
      const SpaceRequest(source: '/runtime/screens/profile'),
    );
    expect(jsonEncode(screen), contains('loginForm'));
    backend.handle = (r) async =>
        backend.json({'success': false, 'code': 'APP_KEY_INVALID'}, 401);
    await expectLater(
      c.services.send(const SpaceRequest(source: '/runtime/start')),
      throwsA(isA<DioException>()),
    );
  });
  testWidgets(
    'auth widgets accept custom copy while preserving validation and mode-specific defaults',
    (tester) async {
      final backend = Backend();
      final custom = client(backend);
      addTearDown(custom.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SpaceWidget(
                data: {
                  'type': 'loginForm',
                  'title': 'Sign in to My Shop',
                  'subtitle': 'Your personal shopping space',
                  'emailLabel': 'Account email',
                  'passwordLabel': 'Passphrase',
                  'submitText': 'Continue securely',
                },
                controller: custom.controller,
                services: custom.services,
                widgets: custom.widgets,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Sign in to My Shop'), findsOneWidget);
      expect(find.text('Your personal shopping space'), findsOneWidget);
      expect(
        find.widgetWithText(TextFormField, 'Account email'),
        findsOneWidget,
      );
      expect(find.widgetWithText(TextFormField, 'Passphrase'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Continue securely'));
      await tester.pumpAndSettle();
      expect(backend.calls, isEmpty);
      expect(find.text('This field is required'), findsNWidgets(2));
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      expect(find.text('Reset your password'), findsOneWidget);
      expect(find.text('Send reset code'), findsOneWidget);
    },
  );
  testWidgets(
    'hosted app takes two connection values; login validates, signs in and refreshes protected screen',
    (tester) async {
      final backend = Backend();
      var authenticated = false;
      backend.handle = (r) async {
        if (r.path.endsWith('/auth/login')) {
          authenticated = true;
          return backend.json({'success': true, 'data': backend.session()});
        }
        if (!authenticated) {
          return backend.json({'success': false, 'code': 'AUTH_REQUIRED'}, 401);
        }
        return backend.json({
          'success': true,
          'widgets': {
            'type': 'scaffold',
            'body': {'type': 'text', 'text': 'Private profile'},
          },
        });
      };
      final c = client(backend);
      addTearDown(c.dispose);
      await tester.pumpWidget(SpaceHostedApp.client(client: c));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(
        backend.calls.where((r) => r.path.endsWith('/auth/login')),
        isEmpty,
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'alice@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'test-password',
      );
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Private profile'), findsOneWidget);
      expect(c.signedIn, true);
      await tester.runAsync(c.logout);
      await tester.pumpAndSettle();
      // Resetting the app navigator removes private routes and local screen state.
      expect(c.controller.read('auth.signedIn'), false);
    },
  );
  testWidgets(
    'hosted theme follows the server, including updates and dark appearance',
    (tester) async {
      final backend = Backend();
      var primary = '#0066ff', mode = 'light';
      backend.handle = (request) async => backend.json({
        'success': true,
        'theme': {'seedColor': '#ff8800', 'primaryColor': primary},
        'darkTheme': {'primaryColor': '#99bbff'},
        'themeMode': mode,
        'widgets': {
          'type': 'scaffold',
          'body': {
            'type': 'text',
            'text': 'Hosted color',
            'color': '@theme.primary',
          },
        },
      });
      final c = client(backend);
      addTearDown(c.dispose);
      await tester.pumpWidget(SpaceHostedApp.client(client: c));
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Hosted color')).style!.color,
        const Color(0xff0066ff),
      );
      primary = '#ff8800';
      await tester.runAsync(
        () => c.services.send(const SpaceRequest(source: '/runtime/start')),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Hosted color')).style!.color,
        const Color(0xffff8800),
      );
      mode = 'dark';
      await tester.runAsync(
        () => c.services.send(const SpaceRequest(source: '/runtime/start')),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Hosted color')).style!.color,
        const Color(0xff99bbff),
      );
      expect(
        tester.widget<MaterialApp>(find.byType(MaterialApp)).themeMode,
        ThemeMode.dark,
      );
    },
  );
  testWidgets(
    'changing hosted clients discards the previous app navigator and private routes',
    (tester) async {
      final backendA = Backend(), backendB = Backend();
      backendA.handle = (_) async => backendA.json({
        'success': true,
        'widgets': {
          'type': 'scaffold',
          'body': {'type': 'text', 'text': 'Application A'},
        },
      });
      backendB.handle = (_) async => backendB.json({
        'success': true,
        'widgets': {
          'type': 'scaffold',
          'body': {'type': 'text', 'text': 'Application B'},
        },
      });
      final a = client(backendA), b = client(backendB);
      addTearDown(a.dispose);
      addTearDown(b.dispose);
      await tester.pumpWidget(SpaceHostedApp.client(client: a));
      await tester.pumpAndSettle();
      final navigator = tester.state<NavigatorState>(
        find.byType(Navigator).first,
      );
      navigator
          .push<void>(
            MaterialPageRoute(
              builder: (_) => const Scaffold(body: Text('Private A route')),
            ),
          )
          .ignore();
      await tester.pumpAndSettle();
      expect(find.text('Private A route'), findsOneWidget);
      await tester.pumpWidget(SpaceHostedApp.client(client: b));
      await tester.pumpAndSettle();
      expect(find.text('Application B'), findsOneWidget);
      expect(find.text('Private A route'), findsNothing);
    },
  );
}
