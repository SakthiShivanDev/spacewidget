import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

Map<String, dynamic> leaf(String text) => {'type': 'text', 'text': text};

// Exercise actual Flutter build/layout for every advertised type, including
// required parents (Flex, Stack, DefaultTabController), rather than just parsing.
Map<String, dynamic> fixture(String type) {
  var node = <String, dynamic>{'type': type, 'child': leaf('Content')};
  switch (type) {
    case 'navigationBar':
    case 'bottomNavigationBar':
    case 'navigationRail':
      node['destinations'] = [
        {'icon': 'home', 'label': 'Home'},
        {'icon': 'person', 'label': 'Profile'},
      ];
    case 'defaultTabController':
      node['length'] = 2;
    case 'tabBar':
    case 'tabBarView':
      node = {
        'type': 'defaultTabController',
        'length': 2,
        'child': {
          'type': type,
          'children': type == 'tabBar'
              ? [
                  {'type': 'tab', 'text': 'One'},
                  {'type': 'tab', 'text': 'Two'},
                ]
              : [leaf('One'), leaf('Two')],
        },
      };
    case 'positioned':
      node = {
        'type': 'stack',
        'children': [node],
      };
    case 'expanded':
    case 'flexible':
    case 'spacer':
      node = {
        'type': 'column',
        'children': [node],
      };
    case 'aspectRatio':
      node['aspectRatio'] = 1.5;
    case 'repeat':
      node['items'] = [
        {'title': 'One'},
      ];
      node['template'] = leaf('{{item.title}}');
    case 'responsive':
      node['small'] = leaf('Small');
      node['medium'] = leaf('Medium');
    case 'conditional':
      node['condition'] = true;
    case 'dataTable':
      node['columns'] = ['Name'];
      node['rows'] = [
        ['SpaceWidget'],
      ];
    case 'stepper':
      node['steps'] = [
        {'title': 'First', 'content': leaf('Details')},
      ];
    case 'dropdown':
    case 'radio':
      node['options'] = [
        {'label': 'One', 'value': 1},
        {'label': 'Two', 'value': 2},
      ];
      node['initialValue'] = 1;
    case 'quantitySelector':
      node['bind'] = 'quantity';
    case 'countdown':
      node['endsAt'] = DateTime.now()
          .add(const Duration(minutes: 2))
          .toIso8601String();
    case 'dataView':
    case 'paginatedList':
      node['source'] = '/items';
      node['template'] = leaf('{{item.name}}');
    case 'live':
      node['stream'] = 'updates';
      node['source'] = '/live';
    case 'sliverPadding':
      node['child'] = {'type': 'sliverToBoxAdapter', 'child': leaf('Padding')};
    case 'slider':
      node['initialValue'] = 0.5;
    case 'row':
    case 'column':
    case 'stack':
    case 'wrap':
    case 'listView':
    case 'gridView':
    case 'pageView':
    case 'textSpan':
    case 'richText':
      node['children'] = [leaf('One'), leaf('Two')];
  }
  if (type.startsWith('sliver') || type == 'stickyHeader') {
    node = {
      'type': 'customScrollView',
      'children': [node],
    };
  }
  return node;
}

void main() {
  for (final type in spaceWidgetTypes) {
    testWidgets('$type builds with its supported parent and properties', (
      tester,
    ) async {
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 500,
              height: 500,
              child: SpaceWidget(
                data: fixture(type),
                onError: issues.add,
                services: SpaceServices(
                  transport: (_) async => {
                    'success': true,
                    'data': {'items': []},
                  },
                  streams: {'updates': (_) => const Stream.empty()},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(issues, isEmpty, reason: type);
      expect(tester.takeException(), isNull, reason: type);
    });
  }

  testWidgets(
    'all selection controls submit typed values and required dropdowns validate',
    (tester) async {
      Map<String, dynamic>? submitted;
      final controller = SpaceController();
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(
              child: SpaceWidget(
                controller: controller,
                data: {
                  'type': 'form',
                  'id': 'choices',
                  'children': [
                    {
                      'type': 'dropdown',
                      'name': 'role',
                      'required': true,
                      'options': [
                        {'label': 'Developer', 'value': 10},
                        {'label': 'Designer', 'value': 20},
                      ],
                    },
                    {
                      'type': 'checkbox',
                      'name': 'terms',
                      'label': 'Agree',
                      'required': true,
                    },
                    {
                      'type': 'radio',
                      'name': 'plan',
                      'initialValue': 'basic',
                      'options': [
                        {'label': 'Basic', 'value': 'basic'},
                        {'label': 'Pro', 'value': 'pro'},
                      ],
                    },
                    {'type': 'switch', 'name': 'alerts', 'initialValue': true},
                    {'type': 'slider', 'name': 'volume', 'initialValue': 0.5},
                    {
                      'type': 'button',
                      'text': 'Submit',
                      'action': {'type': 'submit', 'name': 'save'},
                    },
                  ],
                },
                actions: {'save': (event) => submitted = event.values},
              ),
            ),
          ),
        ),
      );
      await tester.ensureVisible(find.text('Submit'));
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      expect(submitted, isNull);
      expect(find.text('This field is required'), findsNWidgets(2));
      controller.setValue('role', 20);
      controller.setValue('terms', true);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit'));
      await tester.pumpAndSettle();
      expect(submitted, {
        'role': 20,
        'terms': true,
        'plan': 'basic',
        'alerts': true,
        'volume': 0.5,
      });
    },
  );

  testWidgets('nested theme is visible to custom widget builders', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: SpaceWidget(
          data: {
            'type': 'theme',
            'brightness': 'dark',
            'child': {'type': 'custom'},
          },
          widgets: {
            'custom': (context) =>
                Text(Theme.of(context.context).brightness.name),
          },
        ),
      ),
    );
    expect(find.text('dark'), findsOneWidget);
  });
}
