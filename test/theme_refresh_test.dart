import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  const theme = {
    'seedColor': '#ffaa00',
    'primaryColor': '#0066ff',
    'secondaryColor': '#ff6600',
    'backgroundColor': '#f0f1f2',
    'surfaceColor': '#ffffff',
    'onSurfaceColor': '#112233',
    'fontSize': 16,
    'borderRadius': 12,
  };
  test('shared theme keeps exact colors and supplies typography and component defaults', () {
    final data = buildSpaceTheme(theme);
    expect(data.colorScheme.primary, const Color(0xff0066ff));
    expect(data.colorScheme.secondary, const Color(0xffff6600));
    expect(data.scaffoldBackgroundColor, const Color(0xfff0f1f2));
    expect(data.textTheme.bodyMedium!.fontSize, 16);
    expect(
      data.filledButtonTheme.style!.shape!.resolve({}),
      isA<RoundedRectangleBorder>(),
    );
    final dark = buildSpaceTheme(
      spaceDarkTheme(theme, {'primaryColor': '#99bbff'}),
      brightness: Brightness.dark,
    );
    expect(dark.colorScheme.primary, const Color(0xff99bbff));
    expect(dark.colorScheme.brightness, Brightness.dark);
    expect(dark.scaffoldBackgroundColor, isNot(const Color(0xfff0f1f2)));
  });
  testWidgets(
    'server theme beats an orange host, and theme color references follow changes',
    (tester) async {
      Widget app(String primary) => MaterialApp(
        theme: ThemeData(colorSchemeSeed: Colors.orange),
        home: SpaceApp(
          config: {
            'theme': {...theme, 'primaryColor': primary},
            'initialRoute': '/',
            'routes': {
              '/': {
                'type': 'scaffold',
                'body': {
                  'type': 'text',
                  'text': 'Theme text',
                  'color': '@theme.primary',
                },
              },
            },
          },
        ),
      );
      await tester.pumpWidget(app('#0066ff'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Theme text')).style!.color,
        const Color(0xff0066ff),
      );
      await tester.pumpWidget(app('#ff8800'));
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Theme text')).style!.color,
        const Color(0xffff8800),
      );
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSpaceTheme({...theme, 'primaryColor': '#ff8800'}),
          home: const SpaceWidget(
            data: {
              'type': 'text',
              'text': 'Preview text',
              'color': '@theme.primary',
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Preview text')).style!.color,
        const Color(0xffff8800),
      );
    },
  );
  testWidgets(
    'nested JSON themes use the shared builder and explicit widget colors win',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: buildSpaceTheme(theme),
          home: const SpaceWidget(
            data: {
              'type': 'theme',
              'primaryColor': '#ff8800',
              'child': {
                'type': 'column',
                'children': [
                  {'type': 'text', 'text': 'Themed', 'color': '@theme.primary'},
                  {'type': 'text', 'text': 'Explicit', 'color': '#00ff00'},
                ],
              },
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.text('Themed')).style!.color,
        const Color(0xffff8800),
      );
      expect(
        tester.widget<Text>(find.text('Explicit')).style!.color,
        const Color(0xff00ff00),
      );
    },
  );
  testWidgets(
    'cards and fields inherit app corners and keep explicit overrides',
    (tester) async {
      Widget app(double? radius) => MaterialApp(
        theme: buildSpaceTheme(theme),
        home: Scaffold(
          body: SpaceWidget(
            data: {
              'type': 'column',
              'children': [
                {
                  'type': 'card',
                  'borderRadius': radius,
                  'child': {'type': 'text', 'text': 'Card'},
                },
                {'type': 'input', 'name': 'field', 'borderRadius': radius},
              ],
            },
          ),
        ),
      );
      for (final radius in [null, 4.0]) {
        await tester.pumpWidget(app(radius));
        await tester.pumpAndSettle();
        final material = tester.widget<Material>(
          find
              .descendant(
                of: find.byType(Card),
                matching: find.byType(Material),
              )
              .first,
        );
        expect(
          (material.shape as RoundedRectangleBorder).borderRadius,
          BorderRadius.circular(radius ?? 12),
        );
        final field = tester.widget<TextField>(find.byType(TextField));
        expect(
          (field.decoration!.border as OutlineInputBorder).borderRadius,
          BorderRadius.circular(radius ?? 12),
        );
      }
    },
  );
  testWidgets(
    'pull-to-refresh awaits the host data load and ends the indicator',
    (tester) async {
      final completed = Completer<void>();
      var calls = 0;
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SpaceRefreshScope(
              onRefresh: () {
                calls++;
                return completed.future;
              },
              child: SpaceWidget(
                onError: issues.add,
                data: const {
                  'type': 'refreshIndicator',
                  'child': {
                    'type': 'listView',
                    'children': [
                      {'type': 'text', 'text': 'Pull down'},
                    ],
                  },
                },
              ),
            ),
          ),
        ),
      );
      await tester.drag(find.byType(ListView), const Offset(0, 350));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(calls, 1);
      expect(find.byType(RefreshProgressIndicator), findsOneWidget);
      completed.complete();
      await tester.pumpAndSettle();
      expect(find.byType(RefreshProgressIndicator), findsNothing);
      expect(issues, isEmpty);
    },
  );
  testWidgets(
    'failed image sources report a useful issue while preserving the layout',
    (tester) async {
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            onError: issues.add,
            data: const {
              'type': 'image',
              'source': 'asset',
              'src': 'missing-image.png',
              'height': 80,
              'width': 80,
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        issues.any(
          (i) =>
              i.path.endsWith('.src') && i.message.contains('direct image URL'),
        ),
        isTrue,
      );
      expect(find.byIcon(Icons.broken_image_outlined), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
