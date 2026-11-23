import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  testWidgets(
    'named compiled custom builders receive resolved data and missing builders explain setup',
    (tester) async {
      final controller = SpaceController(initialState: {'customer': 'Ada'});
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            controller: controller,
            widgets: spaceCustomWidgets({
              'greeting': (space) =>
                  Text('Hello ${space.read('data')['name']}'),
            }),
            data: const {
              'type': 'customWidget',
              'name': 'greeting',
              'data': {'name': '{{customer}}'},
            },
          ),
        ),
      );
      expect(find.text('Hello Ada'), findsOneWidget);
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            widgets: spaceCustomWidgets({}),
            data: const {'type': 'customWidget', 'name': 'unregistered'},
          ),
        ),
      );
      expect(
        find.textContaining('requires a compiled host builder'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
}
