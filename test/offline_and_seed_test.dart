import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

class MemoryStorage implements SpaceDocumentStorage {
  final documents = <String, Map<String, dynamic>>{};
  @override
  Future<void> clear() async => documents.clear();
  @override
  Future<Map<String, dynamic>?> read(String key) async => documents[key];
  @override
  Future<void> write(String key, Map<String, dynamic> document) async {
    documents[key] = document;
  }
}

void main() {
  testWidgets('search debounces API queries and cancels superseded loads', (
    tester,
  ) async {
    final controller = SpaceController(initialState: {'search': ''});
    addTearDown(controller.dispose);
    final calls = <SpaceRequest>[];
    final pending = <Completer<Map<String, dynamic>>>[];
    final services = SpaceServices(
      transport: (request) {
        calls.add(request);
        final response = Completer<Map<String, dynamic>>();
        pending.add(response);
        return response.future;
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            services: services,
            controller: controller,
            data: {
              'type': 'column',
              'children': [
                {'type': 'searchField', 'bind': 'search', 'debounce': 300},
                {
                  'type': 'dataView',
                  'source': '/search',
                  'query': {'q': '{{search}}'},
                  'initialData': {'label': 'Seed'},
                  'template': {'type': 'text', 'text': '{{data.label}}'},
                },
              ],
            },
          ),
        ),
      ),
    );
    await tester.enterText(find.byType(TextFormField), 'a');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.enterText(find.byType(TextFormField), 'ab');
    controller.setValue('unrelated', true);
    await tester.pump(const Duration(milliseconds: 299));
    expect(calls, isEmpty);
    expect(find.text('ab'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 1));
    expect(calls.single.query['q'], 'ab');
    await tester.enterText(find.byType(TextFormField), 'abc');
    await tester.pump(const Duration(milliseconds: 300));
    expect(calls, hasLength(2));
    expect(calls.first.cancellation!.isCancelled, true);
    pending.last.complete({
      'success': true,
      'data': {'label': 'Current result'},
    });
    await tester.pumpAndSettle();
    pending.first.complete({
      'success': true,
      'data': {'label': 'Stale result'},
    });
    await tester.pumpAndSettle();
    expect(find.text('Current result'), findsOneWidget);
    expect(find.text('Stale result'), findsNothing);
  });

  test('timeouts cancel the underlying transport token', () async {
    final token = SpaceCancellationToken();
    final never = Completer<Map<String, dynamic>>();
    final services = SpaceServices(
      timeout: const Duration(milliseconds: 10),
      transport: (_) => never.future,
    );
    await expectLater(
      services.send(SpaceRequest(source: '/slow', cancellation: token)),
      throwsA(isA<TimeoutException>()),
    );
    expect(token.isCancelled, true);
    never.complete({'success': true});
  });

  testWidgets('transport errors run onFailure and stop the action sequence', (
    tester,
  ) async {
    final controller = SpaceController();
    addTearDown(controller.dispose);
    final issues = <SpaceIssue>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SpaceWidget(
            controller: controller,
            onError: issues.add,
            services: SpaceServices(
              transport: (_) async => throw StateError('Network unavailable'),
            ),
            data: {
              'type': 'button',
              'text': 'Send',
              'action': [
                {
                  'type': 'request',
                  'source': '/save',
                  'onFailure': {'type': 'set', 'path': 'failed', 'value': true},
                },
                {'type': 'set', 'path': 'continued', 'value': true},
              ],
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(controller.read('failed'), true);
    expect(controller.read('continued'), isNull);
    expect(issues, hasLength(1));
  });

  testWidgets('opt-in offline documents survive remount and reconnect', (
    tester,
  ) async {
    final storage = MemoryStorage();
    var online = true, calls = 0;
    final services = SpaceServices(
      storage: storage,
      transport: (_) async {
        calls++;
        if (!online) throw StateError('Offline');
        return {
          'success': true,
          'state': {'name': 'Public lesson'},
          'widgets': {'type': 'text', 'text': '{{name}}'},
        };
      },
    );
    final handle = SpaceScreenController();
    addTearDown(handle.dispose);
    Widget screen({bool fallback = true}) => MaterialApp(
      home: SpaceRemoteScreen(
        source: '/lesson',
        services: services,
        screenController: handle,
        offlineFallback: fallback,
      ),
    );
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(storage.documents, hasLength(1));
    await tester.pumpWidget(const SizedBox());
    online = false;
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();
    expect(find.text('Public lesson'), findsOneWidget);
    expect(handle.status, SpaceLoadStatus.offline);
    online = true;
    await handle.refresh();
    await tester.pumpAndSettle();
    expect(handle.status, SpaceLoadStatus.ready);
    expect(calls, 3);
    await tester.pumpWidget(const SizedBox());
    online = false;
    await tester.pumpWidget(screen(fallback: false));
    await tester.pumpAndSettle();
    expect(find.text('Public lesson'), findsNothing);
    expect(handle.status, SpaceLoadStatus.failed);
  });

  testWidgets('first page embedded in screen avoids a second initial request', (
    tester,
  ) async {
    final requests = <SpaceRequest>[];
    final services = SpaceServices(
      transport: (request) async {
        requests.add(request);
        if (request.source == '/screen') {
          return {
            'success': true,
            'widgets': {
              'type': 'paginatedList',
              'source': '/products',
              'initialItems': [
                {'name': 'First product'},
              ],
              'nextCursor': 'page2',
              'template': {'type': 'text', 'text': '{{item.name}}'},
            },
          };
        }
        return {
          'success': true,
          'data': {
            'items': [
              {'name': 'Second product'},
            ],
            'nextCursor': null,
          },
        };
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        home: SpaceRemoteScreen(source: '/screen', services: services),
      ),
    );
    await tester.pumpAndSettle();
    expect(requests.map((r) => r.source), ['/screen']);
    expect(find.text('First product'), findsOneWidget);
    await tester.tap(find.text('Load more'));
    await tester.pumpAndSettle();
    expect(requests.map((r) => r.source), ['/screen', '/products']);
    expect(requests.last.query['cursor'], 'page2');
    expect(find.text('Second product'), findsOneWidget);
  });
}
