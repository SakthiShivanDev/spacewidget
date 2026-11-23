import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  late Map<String, dynamic> fixture;
  setUpAll(() async {
    final result = await Process.run(
      Platform.environment['STUDIO_NODE_BIN'] ?? 'node',
      ['../test/product-grid-fixture.mjs'],
    );
    expect(result.exitCode, 0, reason: '${result.stderr}');
    fixture = Map<String, dynamic>.from(jsonDecode('${result.stdout}') as Map);
  });
  for (final width in [320.0, 390.0, 768.0, 1280.0]) {
    testWidgets(
      'product grid renders real API data at width $width without overflow',
      (tester) async {
        tester.view.physicalSize = Size(width, 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final issues = <SpaceIssue>[];
        final controller = SpaceController(
          initialState: {'products': fixture['products']},
        );
        addTearDown(controller.dispose);
        await tester.pumpWidget(
          MaterialApp(
            home: SpaceWidget(
              data: fixture['tree'] as Map<String, dynamic>,
              controller: controller,
              onError: issues.add,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(GridView), findsOneWidget);
        expect(
          find.text('Studio headphones with a long product name'),
          findsOneWidget,
        );
        expect(find.text('USD 0'), findsOneWidget);
        expect(issues, isEmpty);
        expect(tester.takeException(), isNull);
        controller.setValue('products', []);
        await tester.pumpAndSettle();
        expect(find.text('No products found.'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
