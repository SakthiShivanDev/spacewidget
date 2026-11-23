import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

class _RealHttp extends HttpOverrides {}

void main() {
  final width =
      double.tryParse(Platform.environment['SPACE_TEST_WIDTH'] ?? '390') ?? 390;
  testWidgets(
    'real commerce app at $width: login, product sheet, cart, checkout, payment, orders, tabs and notification',
    (tester) async {
      final node = Platform.environment['STUDIO_NODE_BIN'] ?? 'node';
      final fixture = File(
        '${Directory.current.parent.parent.path}/studio/test/live-fixture.mjs',
      );
      if (!File(node).existsSync() || !fixture.existsSync()) {
        markTestSkipped(
          'Set STUDIO_NODE_BIN to Node 24 and run from the adapters package.',
        );
        return;
      }
      tester.view.physicalSize = Size(width, width > 600 ? 1713 : 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      late Process process;
      late SpaceClient client;
      late Dio dio;
      await tester.runAsync(() async {
        process = await Process.start(
          node,
          [fixture.path],
          environment: {'SPACE_TEST_TEMPLATE': 'commerce'},
        );
        process.stderr.transform(utf8.decoder).listen((error) {
          if (error.contains('Error:')) debugPrint(error);
        });
        final line = await process.stdout
            .transform(utf8.decoder)
            .transform(const LineSplitter())
            .first
            .timeout(const Duration(seconds: 15));
        final config = jsonDecode(line) as Map;
        dio = Dio()
          ..httpClientAdapter = IOHttpClientAdapter(
            createHttpClient: () => _RealHttp().createHttpClient(null),
          );
        client = SpaceClient(
          baseUrl: config['baseUrl'],
          apiKey: config['apiKey'],
          sessionStore: SpaceMemorySessionStore(),
          dio: dio,
        );
        expect(
          (await client.register(
            name: 'Alice',
            email: 'alice@example.com',
            password: 'commerce-integration-password',
          )).success,
          true,
        );
        await client.logout();
      });
      addTearDown(() async {
        client.dispose();
        dio.close(force: true);
        process.kill();
        await process.exitCode;
      });
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        SpaceHostedApp.client(client: client, onError: issues.add),
      );
      Future<void> settle() async {
        for (var i = 0; i < 20; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 15)),
          );
          await tester.pump(const Duration(milliseconds: 20));
        }
        await tester.pump(const Duration(milliseconds: 350));
      }

      Future<void> waitFor(Finder finder) async {
        for (var i = 0; i < 250; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 15)),
          );
          await tester.pump(const Duration(milliseconds: 20));
          if (finder.evaluate().isNotEmpty) {
            await settle();
            return;
          }
        }
        fail('Did not find $finder. Issues: $issues');
      }

      Future<void> tap(String label) async {
        final finder = find.text(label).last;
        await tester.ensureVisible(finder);
        await tester.pump();
        await tester.tap(finder);
        await tester.pump();
      }

      await waitFor(find.text('Everyday Store'));
      await tap('Account');
      await waitFor(find.widgetWithText(TextFormField, 'Email'));
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Email'),
        'alice@example.com',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Password'),
        'commerce-integration-password',
      );
      await tap('Sign in');
      await waitFor(find.text('Hello, Alice'));
      await tap('Support');
      await settle();
      expect(
        find.text(
          'Contact support for returns, refunds or a delivery question.',
        ),
        findsOneWidget,
      );
      await tap('Shop');
      await waitFor(find.text('Everyday Store'));
      final productImage = find
          .byWidgetPredicate(
            (widget) =>
                widget is Semantics &&
                (widget.properties.label ?? '').startsWith('View product:'),
          )
          .first;
      await tester.ensureVisible(productImage);
      await tester.tap(productImage);
      await tester.pump();
      await waitFor(find.text('Close'));
      expect(find.byType(BottomSheet), findsOneWidget);
      await tap('Add to cart');
      await waitFor(find.text('Added to your cart'));
      expect(find.byType(BottomSheet), findsNothing);
      await tap('Cart');
      await waitFor(find.text('Your cart'));
      await tap('Delivery & checkout');
      await waitFor(find.text('Delivery & checkout'));
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Delivery address'),
        '123 Market Street, Example City',
      );
      await tap('Place order');
      await waitFor(find.text('Order details'));
      await tap('Confirm TEST payment (no charge)');
      await waitFor(find.text('Status · paid'));
      expect(find.text('Cancel unpaid order'), findsNothing);
      await tap('View all orders');
      await waitFor(find.text('Your orders'));
      expect(find.textContaining('paid'), findsWidgets);
      await tap('Account');
      await waitFor(find.text('Hello, Alice'));
      await tap('Notifications');
      await waitFor(find.text('Order confirmed'));
      await tap('Order confirmed');
      await waitFor(find.text('Status · paid'));
      expect(
        issues.where(
          (issue) => !issue.message.contains('Unable to load image'),
        ),
        isEmpty,
        reason: '$issues',
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      dio.close(force: true);
      await tester.pump();
    },
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
