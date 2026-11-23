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
      ['../test/figma-fixture.mjs'],
    );
    expect(result.exitCode, 0, reason: '${result.stderr}');
    fixture = Map<String, dynamic>.from(jsonDecode('${result.stdout}') as Map);
  });
  for (final mode in ['editable', 'snapshot']) {
    testWidgets('Figma $mode import renders real converter output in Flutter', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 300);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final issues = <SpaceIssue>[];
      final controller = SpaceController(
        initialState: {
          'user': {'name': 'Must not replace literal design copy'},
        },
      );
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            data: fixture[mode] as Map<String, dynamic>,
            controller: controller,
            onError: issues.add,
          ),
        ),
      );
      await tester.pumpAndSettle();
      final image = tester.widget<Image>(find.byType(Image));
      expect(image.image, isA<MemoryImage>());
      await tester.runAsync(
        () => precacheImage(image.image, tester.element(find.byType(Image))),
      );
      await tester.pumpAndSettle();
      if (mode == 'editable') {
        expect(find.text('{{user.name}}'), findsOneWidget);
        expect(
          tester.getTopLeft(find.text('Shop from Figma')),
          const Offset(40, 42),
        );
        final heading = tester.widget<Text>(find.text('Shop from Figma'));
        expect(heading.style!.fontSize, 24);
        expect(heading.style!.color, Colors.white);
        expect(tester.getSize(find.byType(Image)), const Size(64, 64));
      } else {
        expect(find.byType(Text), findsNothing);
        expect(tester.getSize(find.byType(Image)), const Size(390, 300));
      }
      expect(issues, isEmpty);
      expect(tester.takeException(), isNull);
    });
  }
}
