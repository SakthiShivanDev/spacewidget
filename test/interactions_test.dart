import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

Future<void> mount(
  WidgetTester tester,
  Map<String, dynamic> tree,
  SpaceController controller, {
  SpaceServices? services,
  SpaceNodeObserver? observer,
}) => tester.pumpWidget(
  MaterialApp(
    home: Scaffold(
      body: SpaceWidget(
        data: tree,
        controller: controller,
        services: services,
        onNodeBuilt: observer,
      ),
    ),
  ),
);
void main() {
  testWidgets(
    'bottom navigation selects without a bind and dispatches selected item event',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      await mount(tester, {
        'type': 'navigationBar',
        'destinations': [
          {'icon': 'home', 'label': 'Home'},
          {'icon': 'person', 'label': 'Profile'},
        ],
        'onChanged': {
          'type': 'set',
          'path': 'selected',
          'value': '{{event.index}}',
        },
      }, controller);
      await tester.tap(find.text('Profile'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex,
        1,
      );
      expect(controller.read('selected'), 1);
    },
  );
  testWidgets(
    'pill navigation keeps selected semantics and dispatches destination actions',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      await mount(tester, {
        'type': 'navigationBar',
        'destinationStyle': 'pill',
        'bind': 'tab',
        'destinations': [
          {'icon': 'home', 'selectedIcon': 'home_filled', 'label': 'Shop'},
          {
            'icon': 'shopping_cart',
            'label': 'Cart',
            'action': {
              'type': 'set',
              'path': 'opened',
              'value': '{{event.item.label}}',
            },
          },
        ],
      }, controller);
      await tester.tap(find.text('Cart'));
      await tester.pumpAndSettle();
      expect(controller.read('tab'), 1);
      expect(controller.read('opened'), 'Cart');
      expect(
        tester
            .widget<Semantics>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is Semantics && widget.properties.label == 'Cart',
              ),
            )
            .properties
            .selected,
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'search submission publishes the latest value before its debounced change',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      await mount(tester, {
        'type': 'searchField',
        'bind': 'query',
        'hint': 'Find a product',
        'debounce': 500,
        'textInputAction': 'search',
        'borderColor': '#d7dcff',
        'onSubmitted': {
          'type': 'set',
          'path': 'submitted',
          'value': '{{query}}',
        },
        'onChanged': {'type': 'increment', 'path': 'changes'},
      }, controller);
      await tester.enterText(find.byType(TextFormField), 'lamp');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      expect(controller.read('submitted'), 'lamp');
      await tester.pump(const Duration(milliseconds: 600));
      expect(controller.read('changes'), isNull);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'repeated product favourites read the same app path they toggle',
    (tester) async {
      final app = SpaceController();
      final controller = SpaceController(parent: app);
      addTearDown(controller.dispose);
      addTearDown(app.dispose);
      await mount(tester, {
        'type': 'repeat',
        'items': [
          {'id': 'lamp'},
        ],
        'template': {
          'type': 'conditional',
          'condition': '{{app.storefront.favorites.{{item.id}}}}',
          'then': {
            'type': 'iconButton',
            'icon': 'favorite_filled',
            'tooltip': 'Unsave lamp',
            'action': {
              'type': 'toggle',
              'path': 'app.storefront.favorites.{{item.id}}',
            },
          },
          'else': {
            'type': 'iconButton',
            'icon': 'favorite',
            'tooltip': 'Save lamp',
            'action': {
              'type': 'toggle',
              'path': 'app.storefront.favorites.{{item.id}}',
            },
          },
        },
      }, controller);
      await tester.tap(find.byTooltip('Save lamp'));
      await tester.pump();
      expect(app.read('storefront.favorites.lamp'), true);
      expect(find.byTooltip('Unsave lamp'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'tab taps, swipes and switch-tab actions synchronize bound state once',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      await mount(tester, {
        'type': 'defaultTabController',
        'length': 2,
        'child': {
          'type': 'column',
          'children': [
            {
              'type': 'tabBar',
              'bind': 'selectedTab',
              'onChanged': [
                {'type': 'increment', 'path': 'changes'},
                {'type': 'set', 'path': 'last', 'value': '{{event.index}}'},
              ],
              'children': [
                {'type': 'tab', 'text': 'First'},
                {'type': 'tab', 'text': 'Second'},
              ],
            },
            {
              'type': 'expanded',
              'child': {
                'type': 'tabBarView',
                'children': [
                  {'type': 'text', 'text': 'Page one'},
                  {
                    'type': 'column',
                    'children': [
                      {'type': 'text', 'text': 'Page two'},
                      {
                        'type': 'filledButton',
                        'label': 'Back to first',
                        'action': {'type': 'changeTab', 'index': 0},
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      }, controller);
      await tester.tap(find.text('Second'));
      await tester.pumpAndSettle();
      expect(controller.read('selectedTab'), 1);
      expect(controller.read('changes'), 1);
      expect(controller.read('last'), 1);
      await tester.tap(find.text('Back to first'));
      await tester.pumpAndSettle();
      expect(controller.read('selectedTab'), 0);
      expect(controller.read('changes'), 2);
      await tester.drag(find.byType(TabBarView), const Offset(-600, 0));
      await tester.pumpAndSettle();
      expect(controller.read('selectedTab'), 1);
      expect(controller.read('changes'), 3);
      controller.setValue('selectedTab', 0);
      await tester.pumpAndSettle();
      expect(
        DefaultTabController.of(tester.element(find.byType(TabBar))).index,
        0,
      );
      expect(tester.takeException(), isNull);
    },
  );
  for (final type in ['dialog', 'bottomSheet']) {
    testWidgets(
      '$type opens editable content, shares state and saves close results',
      (tester) async {
        final controller = SpaceController();
        addTearDown(controller.dispose);
        final observed = <String>[];
        final content = type == 'dialog'
            ? {
                'type': 'alertDialog',
                'title': 'Confirm',
                'content': {
                  'type': 'text',
                  'id': 'overlay-copy',
                  'text': 'Overlay content',
                },
                'actions': [
                  {
                    'type': 'textButton',
                    'label': 'Accept',
                    'action': {'type': 'pop', 'result': 'accepted'},
                  },
                ],
              }
            : {
                'type': 'column',
                'mainAxisSize': 'min',
                'children': [
                  {
                    'type': 'text',
                    'id': 'overlay-copy',
                    'text': 'Overlay content',
                  },
                  {
                    'type': 'filledButton',
                    'label': 'Accept',
                    'action': {'type': 'pop', 'result': 'accepted'},
                  },
                ],
              };
        await mount(
          tester,
          {
            'type': 'filledButton',
            'label': 'Open',
            'action': {
              'type': type,
              'content': content,
              'resultPath': 'result',
              'onDismiss': {
                'type': 'set',
                'path': 'afterClose',
                'value': '{{event.result}}',
              },
            },
          },
          controller,
          observer: (node, _) {
            if (node.id != null) observed.add(node.id!);
          },
        );
        await tester.tap(find.text('Open'));
        await tester.pumpAndSettle();
        expect(find.text('Overlay content'), findsOneWidget);
        expect(observed, contains('overlay-copy'));
        await tester.tap(find.text('Accept'));
        await tester.pumpAndSettle();
        expect(find.text('Overlay content'), findsNothing);
        expect(controller.read('result'), 'accepted');
        expect(controller.read('afterClose'), 'accepted');
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'API widgets may be presented as a bottom sheet and failures expose a useful result',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      final services = SpaceServices(
        transport: (r) async => r.source == '/failure'
            ? {'success': false, 'message': 'Out of stock'}
            : {
                'success': true,
                'widgets': {'type': 'text', 'text': 'API sheet'},
              },
      );
      await mount(
        tester,
        {
          'type': 'column',
          'children': [
            {
              'type': 'filledButton',
              'label': 'Load sheet',
              'action': {
                'type': 'request',
                'source': '/sheet',
                'presentation': 'bottomSheet',
              },
            },
            {
              'type': 'filledButton',
              'label': 'Fail',
              'action': {
                'type': 'request',
                'source': '/failure',
                'resultPath': 'response',
                'onFailure': {
                  'type': 'set',
                  'path': 'error',
                  'value': '{{response.message}}',
                },
              },
            },
          ],
        },
        controller,
        services: services,
      );
      await tester.tap(find.text('Load sheet'));
      await tester.pumpAndSettle();
      expect(find.text('API sheet'), findsOneWidget);
      Navigator.of(tester.element(find.text('API sheet'))).pop();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Fail'));
      await tester.pumpAndSettle();
      expect(controller.read('error'), 'Out of stock');
    },
  );
  testWidgets('custom dialog content receives a Material dialog surface', (
    tester,
  ) async {
    final controller = SpaceController();
    addTearDown(controller.dispose);
    await mount(tester, {
      'type': 'filledButton',
      'label': 'Custom dialog',
      'action': {
        'type': 'dialog',
        'content': {
          'type': 'column',
          'mainAxisSize': 'min',
          'children': [
            {'type': 'text', 'text': 'Custom content'},
            {
              'type': 'textButton',
              'label': 'Close custom',
              'action': {'type': 'pop'},
            },
          ],
        },
      },
    }, controller);
    await tester.tap(find.text('Custom dialog'));
    await tester.pumpAndSettle();
    expect(find.byType(Dialog), findsOneWidget);
    expect(
      find.ancestor(
        of: find.text('Custom content'),
        matching: find.byType(Material),
      ),
      findsWidgets,
    );
    await tester.tap(find.text('Close custom'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'submit validates fields before running an authentication integration',
    (tester) async {
      final controller = SpaceController();
      addTearDown(controller.dispose);
      final sent = <Map<String, dynamic>>[];
      final services = SpaceServices(
        transport: (_) async => {'success': true},
        operations: {
          'authLogin': (r) async {
            sent.add(r.data);
            return SpaceResult(success: true);
          },
        },
      );
      await mount(
        tester,
        {
          'type': 'form',
          'id': 'customer',
          'children': [
            {
              'type': 'input',
              'name': 'email',
              'label': 'Email',
              'required': true,
            },
            {
              'type': 'filledButton',
              'label': 'Sign in',
              'action': {'type': 'submit', 'operation': 'authLogin'},
            },
          ],
        },
        controller,
        services: services,
      );
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(sent, isEmpty);
      await tester.enterText(find.byType(TextFormField), 'buyer@example.com');
      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(sent.single['email'], 'buyer@example.com');
    },
  );
  testWidgets(
    'API payload content and event-named fields resolve while callbacks stay deferred',
    (tester) async {
      final controller = SpaceController(
        initialState: {
          'draft': {'content': 'My booking', 'status': 'pending'},
        },
      );
      addTearDown(controller.dispose);
      Map<String, dynamic>? sent;
      final services = SpaceServices(
        transport: (r) async {
          sent = r.data;
          return {
            'success': true,
            'data': {'id': 'saved-id'},
          };
        },
      );
      await mount(
        tester,
        {
          'type': 'filledButton',
          'label': 'Save payload',
          'action': {
            'type': 'request',
            'method': 'POST',
            'source': '/custom',
            'data': {
              'type': 'booking',
              'content': '{{draft.content}}',
              'onSuccess': '{{draft.status}}',
            },
            'resultPath': 'response',
            'onSuccess': {
              'type': 'set',
              'path': 'saved',
              'value': '{{response.id}}',
            },
          },
        },
        controller,
        services: services,
      );
      await tester.tap(find.text('Save payload'));
      await tester.pumpAndSettle();
      expect(sent, {
        'type': 'booking',
        'content': 'My booking',
        'onSuccess': 'pending',
      });
      expect(controller.read('saved'), 'saved-id');
    },
  );
  testWidgets(
    'conditional confirmation branches preserve deferred API success bindings',
    (tester) async {
      final controller = SpaceController(initialState: {'confirmed': false});
      addTearDown(controller.dispose);
      var requests = 0;
      final services = SpaceServices(
        transport: (_) async {
          requests++;
          return {
            'success': true,
            'data': {'id': 'new-order'},
          };
        },
      );
      await mount(
        tester,
        {
          'type': 'filledButton',
          'label': 'Confirm action',
          'action': {
            'type': 'if',
            'condition': '{{confirmed}}',
            'then': {
              'type': 'request',
              'source': '/order',
              'resultPath': 'response',
              'onSuccess': {
                'type': 'set',
                'path': 'saved',
                'value': '{{response.id}}',
              },
            },
            'else': {'type': 'set', 'path': 'cancelled', 'value': true},
          },
        },
        controller,
        services: services,
      );
      await tester.tap(find.text('Confirm action'));
      await tester.pumpAndSettle();
      expect(requests, 0);
      expect(controller.read('cancelled'), true);
      controller.setValue('confirmed', true);
      await tester.pump();
      await tester.tap(find.text('Confirm action'));
      await tester.pumpAndSettle();
      expect(requests, 1);
      expect(controller.read('saved'), 'new-order');
    },
  );
}
