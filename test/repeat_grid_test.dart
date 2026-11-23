import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  testWidgets(
    'data-bound repeat grid renders rows, updates products and scopes card actions',
    (tester) async {
      final controller = SpaceController(
        initialState: {
          'products': [
            {'id': 'p1', 'name': 'Headphones'},
            {'id': 'p2', 'name': 'Backpack'},
            {'id': 'p3', 'name': 'Lamp'},
          ],
        },
      );
      addTearDown(controller.dispose);
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SpaceWidget(
              controller: controller,
              onError: issues.add,
              data: {
                'type': 'repeat',
                'layout': 'grid',
                'items': '{{products}}',
                'crossAxisCount': 2,
                'childAspectRatio': 1.5,
                'template': {
                  'type': 'inkWell',
                  'action': {
                    'type': 'set',
                    'path': 'selectedProduct',
                    'value': '{{item.id}}',
                  },
                  'child': {'type': 'text', 'text': '{{item.name}}'},
                },
                'empty': {'type': 'emptyState', 'text': 'No products found.'},
              },
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(GridView), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Headphones')).dy,
        tester.getTopLeft(find.text('Backpack')).dy,
      );
      expect(
        tester.getTopLeft(find.text('Lamp')).dy,
        greaterThan(tester.getTopLeft(find.text('Headphones')).dy),
      );
      await tester.tap(find.text('Backpack'));
      await tester.pumpAndSettle();
      expect(controller.read('selectedProduct'), 'p2');
      controller.setValue('products', []);
      await tester.pumpAndSettle();
      expect(find.text('No products found.'), findsOneWidget);
      expect(find.byType(GridView), findsNothing);
      expect(issues, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
}
