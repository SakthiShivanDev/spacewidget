import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

Map<String, dynamic> text(String value) => {'type': 'text', 'text': value};
Map<String, dynamic> button(String label, dynamic action) => {
  'type': 'button',
  'text': label,
  'action': action,
};
Future<void> mount(
  WidgetTester tester,
  Map<String, dynamic> data, {
  SpaceController? controller,
  Map<String, SpaceActionHandler> actions = const {},
  Map<String, SpaceWidgetBuilder> widgets = const {},
  ValueChanged<SpaceIssue>? onError,
}) => tester.pumpWidget(
  MaterialApp(
    home: Scaffold(
      body: SpaceWidget(
        data: data,
        controller: controller,
        actions: actions,
        widgets: widgets,
        onError: onError,
      ),
    ),
  ),
);

void main() {
  group('schema and state', () {
    test(
      'legacy style and explicit props merge with documented precedence',
      () {
        final node = SpaceNode.fromJson({
          'widgetType': 'text',
          'style': {'fontSize': 12, 'color': 'red'},
          'text': 'Hello',
          'props': {'fontSize': 24},
        });
        expect(node.type, 'text');
        expect(node.props['fontSize'], 24);
        expect(node.props['color'], 'red');
        expect(() => node.props['text'] = 'mutated', throwsUnsupportedError);
      },
    );
    test('malformed children and missing types produce located errors', () {
      expect(
        () => SpaceNode.fromJson({
          'type': 'column',
          'children': [1],
        }),
        throwsA(
          isA<FormatException>().having(
            (e) => e.message,
            'path',
            contains(r'$.children[0]'),
          ),
        ),
      );
      expect(() => SpaceNode.fromJson({}), throwsFormatException);
    });
    test('nested widget trees have a configurable depth limit', () {
      Map<String, dynamic> node = text('end');
      for (var i = 0; i < 10; i++) {
        node = {'type': 'center', 'child': node};
      }
      expect(
        () => SpaceNode.fromJson(node, maxDepth: 5),
        throwsFormatException,
      );
    });
    test('controller preserves typed bindings and freezes snapshots', () {
      final source = <String, dynamic>{
        'user': {'name': 'Sakthi'},
        'count': 2,
        'ready': false,
      };
      final controller = SpaceController(initialState: source);
      addTearDown(controller.dispose);
      (source['user'] as Map)['name'] = 'changed';
      expect(controller.resolve('Hello {{user.name}}'), 'Hello Sakthi');
      expect(controller.resolve('{{count}}'), 2);
      expect(controller.resolve('{{ready}}'), false);
      var notifications = 0;
      controller.addListener(() => notifications++);
      controller.setValue('user.name', 'Space');
      expect(controller.read('user.name'), 'Space');
      expect(notifications, 1);
      expect(
        () => (controller.state['user'] as Map)['name'] = 'bad',
        throwsUnsupportedError,
      );
      expect(() => controller.setValue('bad..path', 1), throwsArgumentError);
    });
    test('RGB, ARGB, short and named colors are parsed consistently', () {
      expect(parseSpaceColor('#123'), const Color(0xFF112233));
      expect(parseSpaceColor('80112233'), const Color(0x80112233));
      expect(parseSpaceColor('#112233'), const Color(0xFF112233));
      expect(parseSpaceColor('blue'), Colors.blue);
      expect(() => parseSpaceColor('#oops'), throwsFormatException);
    });
  });

  testWidgets(
    'unknown widgets and missing properties recover with diagnostics',
    (tester) async {
      final issues = <SpaceIssue>[];
      await mount(tester, {
        'type': 'column',
        'children': [
          {'type': 'padding', 'child': text('No style needed')},
          {'type': 'unregistered'},
        ],
      }, onError: issues.add);
      expect(find.text('No style needed'), findsOneWidget);
      expect(issues.single.message, contains('unknown widget type'));
      expect(tester.takeException(), isNull);
      await mount(tester, {
        'type': 'column',
        'children': 'bad',
      }, onError: issues.add);
      expect(find.textContaining('expected a list'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('custom widgets can render children and dispatch host actions', (
    tester,
  ) async {
    var calls = 0;
    await mount(
      tester,
      {'type': 'customCard', 'child': text('Custom child')},
      widgets: {
        'customCard': (context) => TextButton(
          onPressed: () => context.dispatch('custom'),
          child: context.build(context.node.child!),
        ),
      },
      actions: {'custom': (_) => calls++},
    );
    await tester.tap(find.text('Custom child'));
    await tester.pump();
    expect(calls, 1);
  });

  testWidgets('state changes update interpolation and conditional content', (
    tester,
  ) async {
    final controller = SpaceController(
      initialState: {'visible': false, 'name': 'World'},
    );
    addTearDown(controller.dispose);
    await mount(tester, {
      'type': 'column',
      'children': [
        text('Hello {{name}}'),
        button('Toggle', {'type': 'toggle', 'path': 'visible'}),
        {
          'type': 'conditional',
          'condition': '{{visible}}',
          'then': text('Shown'),
          'else': text('Hidden'),
        },
      ],
    }, controller: controller);
    expect(find.text('Hidden'), findsOneWidget);
    await tester.tap(find.text('Toggle'));
    await tester.pumpAndSettle();
    expect(find.text('Shown'), findsOneWidget);
    controller.setValue('name', 'Sakthi');
    await tester.pump();
    expect(find.text('Hello Sakthi'), findsOneWidget);
  });

  testWidgets(
    'required inputs validate and form state survives unrelated rebuilds',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      Map<String, dynamic>? submitted;
      await mount(
        tester,
        {
          'type': 'form',
          'id': 'profile',
          'children': [
            {
              'type': 'input',
              'name': 'name',
              'label': 'Name',
              'required': true,
            },
            {'type': 'input', 'name': 'email', 'label': 'Email', 'email': true},
            button('Save', {
              'type': 'submit',
              'name': 'save',
              'form': 'profile',
            }),
          ],
        },
        controller: controller,
        actions: {'save': (event) => submitted = event.values},
      );
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('This field is required'), findsOneWidget);
      expect(submitted, isNull);
      await tester.enterText(find.byType(TextFormField).first, 'Sakthi');
      await tester.enterText(find.byType(TextFormField).last, 'invalid');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Enter a valid email address'), findsOneWidget);
      controller.setValue('unrelated', 1);
      await tester.pump();
      expect(find.text('Sakthi'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).last, 'me@example.com');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(submitted, {'name': 'Sakthi', 'email': 'me@example.com'});
      controller.setValue('name', 'Updated');
      await tester.pump();
      expect(find.text('Updated'), findsOneWidget);
    },
  );

  testWidgets('forms with the same id on different renderers remain isolated', (
    tester,
  ) async {
    final submissions = <String>[];
    Widget form(String value) => SpaceWidget(
      data: {
        'type': 'form',
        'id': 'same',
        'children': [
          {'type': 'input', 'name': 'name', 'initialValue': value},
          button('Save $value', {'type': 'submit', 'name': 'save'}),
        ],
      },
      actions: {
        'save': (event) => submissions.add(event.values['name'] as String),
      },
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: Column(children: [form('One'), form('Two')])),
      ),
    );
    await tester.tap(find.text('Save One'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save Two'));
    await tester.pumpAndSettle();
    expect(submissions, ['One', 'Two']);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'buttons block duplicate async submissions and survive disposal',
    (tester) async {
      final completer = Completer<void>();
      var calls = 0;
      await mount(
        tester,
        button('Send', 'send'),
        actions: {
          'send': (_) {
            calls++;
            return completer.future;
          },
        },
      );
      await tester.tap(find.text('Send'));
      await tester.pump();
      await tester.tap(find.byType(ElevatedButton));
      await tester.pump();
      expect(calls, 1);
      await tester.pumpWidget(const SizedBox());
      completer.complete();
      await tester.pump();
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'repeat interpolates item data and retains global state bindings',
    (tester) async {
      final controller = SpaceController(
        initialState: {
          'suffix': '!',
          'items': [
            {'name': 'One'},
            {'name': 'Two'},
          ],
        },
      );
      addTearDown(controller.dispose);
      await mount(tester, {
        'type': 'repeat',
        'items': '{{items}}',
        'template': text('{{index}}: {{item.name}}{{suffix}}'),
      }, controller: controller);
      expect(find.text('0: One!'), findsOneWidget);
      expect(find.text('1: Two!'), findsOneWidget);
      controller.setValue('items', [
        {'name': 'Three'},
      ]);
      await tester.pumpAndSettle();
      expect(find.text('0: Three!'), findsOneWidget);
      expect(find.text('1: Two!'), findsNothing);
    },
  );

  testWidgets(
    'SpaceApp supports deep initial routes, navigation and shared state',
    (tester) async {
      await tester.pumpWidget(
        SpaceApp(
          config: {
            'schemaVersion': 1,
            'initialRoute': '/home/deep',
            'state': {'name': 'Shared'},
            'routes': {
              '/home/deep': {
                'type': 'scaffold',
                'appBar': {'type': 'appBar', 'title': 'Home'},
                'body': button('Details', {
                  'type': 'navigate',
                  'route': '/details',
                }),
              },
              '/details': {
                'type': 'scaffold',
                'appBar': {'type': 'appBar', 'title': 'Details'},
                'body': {
                  'type': 'column',
                  'children': [
                    text('{{name}}'),
                    button('Return', {'type': 'pop'}),
                  ],
                },
              },
            },
          },
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Home'), findsOneWidget);
      await tester.tap(find.text('Details'));
      await tester.pumpAndSettle();
      expect(find.text('Shared'), findsOneWidget);
      await tester.tap(find.text('Return'));
      await tester.pumpAndSettle();
      expect(find.text('Home'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('dialog actions render independent dynamic content', (
    tester,
  ) async {
    await mount(
      tester,
      button('Open', {
        'type': 'dialog',
        'content': {
          'type': 'alertDialog',
          'title': 'Hello',
          'text': 'Dynamic content',
          'actions': [
            button('Dismiss', {'type': 'pop'}),
          ],
        },
      }),
    );
    await tester.tap(find.text('Open'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Dynamic content'), findsOneWidget);
    await tester.tap(find.text('Dismiss'));
    await tester.pumpAndSettle();
    expect(find.text('Dynamic content'), findsNothing);
  });

  testWidgets('responsive layout switches branches with available width', (
    tester,
  ) async {
    await mount(tester, {
      'type': 'responsive',
      'small': text('Small'),
      'medium': text('Medium'),
      'large': text('Large'),
    });
    expect(find.text('Medium'), findsOneWidget);
    tester.view.physicalSize = const Size(400, 600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pump();
    expect(find.text('Small'), findsOneWidget);
  });

  testWidgets('action exceptions are delivered to onError', (tester) async {
    final issues = <SpaceIssue>[];
    await mount(
      tester,
      button('Fail', 'fail'),
      actions: {'fail': (_) => throw StateError('Failed')},
      onError: issues.add,
    );
    await tester.tap(find.text('Fail'));
    await tester.pumpAndSettle();
    expect(issues.single.path, endsWith('.action'));
    expect(tester.takeException(), isNull);
  });
  testWidgets('invalid submission stops subsequent actions in a sequence', (
    tester,
  ) async {
    final controller = SpaceController();
    addTearDown(controller.dispose);
    await mount(
      tester,
      {
        'type': 'form',
        'id': 'profile',
        'children': [
          {'type': 'input', 'name': 'name', 'required': true},
          button('Save chain', [
            {'type': 'submit', 'name': 'save'},
            {'type': 'set', 'path': 'done', 'value': true},
          ]),
        ],
      },
      controller: controller,
      actions: {'save': (_) {}},
    );
    await tester.tap(find.text('Save chain'));
    await tester.pumpAndSettle();
    expect(controller.read('done'), isNull);
    await tester.enterText(find.byType(TextFormField), 'Sakthi');
    await tester.tap(find.text('Save chain'));
    await tester.pumpAndSettle();
    expect(controller.read('done'), true);
  });

  testWidgets('failed host action stops its sequence and reports the error', (
    tester,
  ) async {
    final controller = SpaceController();
    addTearDown(controller.dispose);
    final issues = <SpaceIssue>[];
    await mount(
      tester,
      button('Fail chain', [
        'fail',
        {'type': 'set', 'path': 'done', 'value': true},
      ]),
      controller: controller,
      actions: {'fail': (_) => throw StateError('Failed')},
      onError: issues.add,
    );
    await tester.tap(find.text('Fail chain'));
    await tester.pumpAndSettle();
    expect(controller.read('done'), isNull);
    expect(issues, hasLength(1));
  });
}
