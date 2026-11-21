import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

Map<String, dynamic> page(
  String label, {
  Map<String, dynamic> state = const {},
  List<Map<String, dynamic>> children = const [],
}) => {
  'success': true,
  'schemaVersion': 1,
  'state': state,
  'widgets': {
    'type': 'scaffold',
    'body': {
      'type': 'column',
      'children': [
        {'type': 'text', 'text': label},
        ...children,
      ],
    },
  },
};
Map<String, dynamic> button(String label, dynamic action) => {
  'type': 'button',
  'text': label,
  'action': action,
};
Widget remote(
  SpaceServices services, {
  String source = '/home',
  SpaceScreenController? handle,
  SpaceController? app,
}) => MaterialApp(
  home: SpaceRemoteScreen(
    source: source,
    services: services,
    screenController: handle,
    appController: app,
  ),
);

void main() {
  testWidgets(
    'one request per screen; rebuilds do not refetch; endpoint navigation fetches destination once',
    (tester) async {
      final calls = <String>[];
      final services = SpaceServices(
        transport: (request) async {
          calls.add(request.source);
          return request.source == '/home'
              ? page(
                  'Home',
                  children: [
                    button('Details', {
                      'type': 'navigate',
                      'source': '/details',
                    }),
                  ],
                )
              : page(
                  'Details page',
                  children: [
                    button('Back', {'type': 'pop'}),
                  ],
                );
        },
      );
      await tester.pumpWidget(remote(services));
      await tester.pumpAndSettle();
      await tester.pumpWidget(remote(services));
      await tester.pumpAndSettle();
      expect(calls, ['/home']);
      await tester.tap(find.text('Details'));
      await tester.pumpAndSettle();
      expect(calls, ['/home', '/details']);
      expect(find.text('Details page'), findsOneWidget);
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      expect(calls, ['/home', '/details']);
      expect(find.text('Home'), findsOneWidget);
    },
  );

  testWidgets('refreshOnReturn refetches the parent once', (tester) async {
    final calls = <String>[];
    final services = SpaceServices(
      transport: (r) async {
        calls.add(r.source);
        return r.source == '/home'
            ? page(
                'Home',
                children: [
                  button('Details', {
                    'type': 'navigate',
                    'source': '/details',
                    'refreshOnReturn': true,
                  }),
                ],
              )
            : page(
                'Child',
                children: [
                  button('Back', {'type': 'pop'}),
                ],
              );
      },
    );
    await tester.pumpWidget(remote(services));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Details'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(calls, ['/home', '/details', '/home']);
  });

  testWidgets(
    'remote screens isolate local fields and explicitly share app state',
    (tester) async {
      final app = SpaceController(initialState: {'user': 'Sakthi'});
      addTearDown(app.dispose);
      final services = SpaceServices(
        transport: (r) async => page(
          '{{name}} / {{app.user}}',
          state: {'name': r.source},
          children: [
            button('Open', {'type': 'navigate', 'source': '/second'}),
            button('Back', {'type': 'pop'}),
          ],
        ),
      );
      await tester.pumpWidget(remote(services, app: app));
      await tester.pumpAndSettle();
      expect(find.text('/home / Sakthi'), findsOneWidget);
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(find.text('/second / Sakthi'), findsOneWidget);
      expect(app.read('name'), isNull);
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      expect(find.text('/home / Sakthi'), findsOneWidget);
    },
  );

  testWidgets(
    'superseded and disposed requests are cancelled and cannot replace the screen',
    (tester) async {
      final pending = <String, Completer<Map<String, dynamic>>>{};
      final tokens = <SpaceCancellationToken>[];
      final services = SpaceServices(
        transport: (r) {
          tokens.add(r.cancellation!);
          return (pending[r.source] = Completer()).future;
        },
      );
      await tester.pumpWidget(remote(services, source: '/old'));
      await tester.pump();
      await tester.pumpWidget(remote(services, source: '/new'));
      await tester.pump();
      expect(tokens.first.isCancelled, true);
      pending['/new']!.complete(page('New'));
      await tester.pumpAndSettle();
      pending['/old']!.complete(page('Old'));
      await tester.pumpAndSettle();
      expect(find.text('New'), findsOneWidget);
      expect(find.text('Old'), findsNothing);
      await tester.pumpWidget(remote(services, source: '/pending'));
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
      expect(tokens.last.isCancelled, true);
      pending['/pending']!.complete(page('Ignored'));
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'load failure can retry; refresh failure preserves visible screen',
    (tester) async {
      var count = 0;
      final handle = SpaceScreenController();
      addTearDown(handle.dispose);
      final services = SpaceServices(
        transport: (r) async {
          count++;
          if (count != 2) throw StateError('Network');
          return page('Loaded');
        },
      );
      await tester.pumpWidget(remote(services, handle: handle));
      await tester.pumpAndSettle();
      expect(handle.status, SpaceLoadStatus.failed);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Loaded'), findsOneWidget);
      await handle.refresh();
      await tester.pumpAndSettle();
      expect(find.text('Loaded'), findsOneWidget);
      expect(find.textContaining('Refresh failed'), findsOneWidget);
      expect(count, 3);
    },
  );

  testWidgets('cache is explicit and refresh bypasses it', (tester) async {
    var count = 0;
    final handle = SpaceScreenController();
    addTearDown(handle.dispose);
    var now = DateTime.utc(2026);
    final cache = SpaceDocumentCache(capacity: 1, now: () => now);
    final services = SpaceServices(
      cache: cache,
      transport: (_) async => page('Load ${++count}'),
    );
    Widget view() => MaterialApp(
      home: SpaceRemoteScreen(
        source: '/cached',
        services: services,
        screenController: handle,
        cacheTtl: const Duration(minutes: 1),
      ),
    );
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    now = now.add(const Duration(seconds: 30));
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(count, 1);
    await tester.pumpWidget(const SizedBox());
    now = now.add(const Duration(seconds: 31));
    await tester.pumpWidget(view());
    await tester.pumpAndSettle();
    expect(count, 2); // Reading a cached screen must not extend its freshness.
    await handle.refresh();
    await tester.pumpAndSettle();
    expect(count, 3);
    cache.clear();
  });

  testWidgets(
    'API submit validates, sends typed values, applies state and stops on failure',
    (tester) async {
      final requests = <SpaceRequest>[];
      final services = SpaceServices(
        transport: (r) async {
          requests.add(r);
          if (r.source == '/home') {
            return {
              'success': true,
              'widgets': {
                'type': 'form',
                'id': 'profile',
                'children': [
                  {'type': 'input', 'name': 'name', 'required': true},
                  button('Save', [
                    {'type': 'submit', 'source': '/save'},
                    {'type': 'set', 'path': 'done', 'value': true},
                  ]),
                  {'type': 'text', 'text': 'Done={{done}}'},
                ],
              },
            };
          }
          return {'success': false, 'message': 'Validation failed'};
        },
      );
      await tester.pumpWidget(remote(services));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(requests.length, 1);
      await tester.enterText(find.byType(TextFormField), 'Sakthi');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(requests.length, 2);
      expect(requests.last.method, 'POST');
      expect(requests.last.data, {'name': 'Sakthi'});
      expect(find.text('Done='), findsOneWidget);
    },
  );

  testWidgets(
    'SpaceApp supports a remote initialSource and updates an active inline route',
    (tester) async {
      final services = SpaceServices(
        transport: (_) async => page('Remote initial'),
      );
      await tester.pumpWidget(
        SpaceApp(config: const {'initialSource': '/home'}, services: services),
      );
      await tester.pumpAndSettle();
      expect(find.text('Remote initial'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
      Map<String, dynamic> config(String label) => {
        'routes': {
          '/': {'type': 'text', 'text': label},
        },
      };
      await tester.pumpWidget(SpaceApp(config: config('Old')));
      await tester.pumpAndSettle();
      await tester.pumpWidget(SpaceApp(config: config('Updated')));
      await tester.pumpAndSettle();
      expect(find.text('Updated'), findsOneWidget);
      expect(find.text('Old'), findsNothing);
    },
  );

  testWidgets(
    'malformed field config reaches onError including initial state errors',
    (tester) async {
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SpaceWidget(
              onError: issues.add,
              data: {
                'type': 'column',
                'children': [
                  {'type': 'input', 'enabled': 'yes'},
                  {'type': 'slider', 'min': 'bad'},
                ],
              },
            ),
          ),
        ),
      );
      await tester.pump();
      expect(issues, hasLength(2));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'dropdown cannot submit a value missing from its available options',
    (tester) async {
      var called = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SpaceWidget(
              data: {
                'type': 'form',
                'children': [
                  {
                    'type': 'dropdown',
                    'name': 'role',
                    'required': true,
                    'initialValue': 'admin',
                    'options': [
                      {'label': 'User', 'value': 'user'},
                    ],
                  },
                  button('Save', {'type': 'submit', 'name': 'save'}),
                ],
              },
              actions: {'save': (_) => called = true},
            ),
          ),
        ),
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(called, false);
      expect(find.text('Select an available option'), findsOneWidget);
    },
  );

  testWidgets('dialog content retains live bindings', (tester) async {
    final controller = SpaceController(initialState: {'name': 'Before'});
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            controller: controller,
            data: button('Open', {
              'type': 'dialog',
              'content': {
                'type': 'alertDialog',
                'text': '{{name}}',
                'actions': [
                  button('Update', {
                    'type': 'set',
                    'path': 'name',
                    'value': 'After',
                  }),
                ],
              },
            }),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Update'));
    await tester.pump();
    expect(find.text('After'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });

  testWidgets('paginatedList loads pages once and applies template bindings', (
    tester,
  ) async {
    final requests = <SpaceRequest>[];
    final services = SpaceServices(
      transport: (r) async {
        requests.add(r);
        return {
          'success': true,
          'data': {
            'items': [
              {'name': r.query['cursor'] == null ? 'First' : 'Second'},
            ],
            'nextCursor': r.query['cursor'] == null ? 'next' : null,
          },
        };
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            services: services,
            data: {
              'type': 'paginatedList',
              'source': '/items',
              'template': {'type': 'text', 'text': '{{item.name}}'},
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('First'), findsOneWidget);
    expect(requests, hasLength(1));
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(find.text('Second'), findsOneWidget);
    expect(requests, hasLength(2));
    expect(requests.last.query, {'cursor': 'next'});
  });

  testWidgets('live updates change bound UI and unsubscribe on disposal', (
    tester,
  ) async {
    var cancelled = false;
    final updates = StreamController<Map<String, dynamic>>(
      onCancel: () => cancelled = true,
    );
    addTearDown(updates.close);
    final services = SpaceServices(
      transport: (_) async => {},
      streams: {'tracking': (_) => updates.stream},
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            services: services,
            data: {
              'type': 'live',
              'stream': 'tracking',
              'source': '/order',
              'bind': 'order',
              'child': {'type': 'text', 'text': '{{order.status}}'},
            },
          ),
        ),
      ),
    );
    updates.add({'status': 'Arriving'});
    await tester.pump();
    await tester.pump();
    expect(find.text('Arriving'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
    expect(cancelled, true);
  });

  test(
    'document envelope rejects failed responses and unsupported versions',
    () {
      expect(
        () => SpaceDocument.fromJson({'success': false}),
        throwsA(isA<SpaceRemoteException>()),
      );
      expect(
        () => SpaceDocument.fromJson({'schemaVersion': 2, 'type': 'text'}),
        throwsFormatException,
      );
    },
  );
}
