import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  late Map<String, dynamic> cases;
  setUpAll(() async {
    final node = Platform.environment['STUDIO_NODE_BIN'] ?? 'node';
    final result = await Process.run(node, ['../test/catalog-fixture.mjs']);
    expect(result.exitCode, 0, reason: '${result.stderr}');
    cases = {
      for (final entry in jsonDecode('${result.stdout}') as List)
        entry['type'] as String: entry['tree'],
    };
  });
  for (final type in spaceWidgetTypes) {
    testWidgets('Studio $type defaults render with a valid parent layout', (
      tester,
    ) async {
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            data: Map<String, dynamic>.from(cases[type] as Map),
            onError: issues.add,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));
      expect(issues, isEmpty, reason: '$type: $issues');
      expect(tester.takeException(), isNull, reason: type);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
    });
  }
}
