import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget_example/main.dart';

void main() {
  testWidgets('demo navigates from dashboard to projects and saves a profile', (
    tester,
  ) async {
    final config = jsonDecode(
      await rootBundle.loadString('assets/app.json'),
    ) as Map<String, dynamic>;
    await tester.pumpWidget(DemoApp(config: config));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back, Sakthi'), findsOneWidget);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Projects'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Your projects'), findsOneWidget);
    expect(find.text('A connected community'), findsOneWidget);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Profile'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Make it yours'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Space builder');
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save profile'));
    await tester.pumpAndSettle();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save profile'));
    await tester.pumpAndSettle();
    expect(find.text('Profile saved'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
