import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_example/demo_api.dart';

Future<void> open(
  WidgetTester tester,
  String source,
  DemoApi api, {
  Map<String, SpaceStreamFactory> streams = const {},
}) async {
  await tester.pumpWidget(
    SpaceApp(
      config: {'initialSource': source},
      services: SpaceServices(
        transport: (r) => api.handle(
          r.source,
          method: r.method,
          data: r.data,
          query: r.query,
        ),
        streams: streams,
      ),
      widgets: {
        'map': (context) =>
            const SizedBox(height: 240, child: Text('Delivery map')),
      },
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> tap(WidgetTester tester, String text) async {
  FocusManager.instance.primaryFocus?.unfocus();
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text(text));
  await tester.pumpAndSettle();
  await tester.tap(find.text(text));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'commerce journey adds a selected product, checks out and shows server confirmation',
    (tester) async {
      final api = DemoApi();
      await open(tester, '/ui/commerce', api);
      await tester.tap(find.byTooltip('Increase quantity'));
      await tester.pump();
      await tap(tester, 'Add to cart');
      expect(api.quantity, 2);
      expect(find.text('Total: USD 60'), findsOneWidget);
      await tap(tester, 'Create checkout');
      expect(find.textContaining('no money'), findsOneWidget);
      await tap(tester, 'Confirm demo payment');
      expect(api.paid, true);
      expect(find.text('Demo order paid'), findsOneWidget);
    },
  );
  testWidgets(
    'education journey validates quiz answers and records completion',
    (tester) async {
      final api = DemoApi();
      await open(tester, '/ui/education', api);
      await tap(tester, 'Open lesson');
      await tap(tester, 'Submit quiz');
      expect(api.lessonComplete, false);
      await tap(tester, 'Widgets');
      await tap(tester, 'Submit quiz');
      expect(api.lessonComplete, true);
      expect(find.text('Score: 100%'), findsOneWidget);
    },
  );
  testWidgets(
    'healthcare journey books an available slot and prevents another booking',
    (tester) async {
      final api = DemoApi();
      await open(tester, '/ui/healthcare', api);
      await tester.enterText(find.byType(TextFormField), 'Demo patient');
      await tap(tester, 'Tomorrow, 10:00 AM');
      await tap(tester, 'Book appointment');
      expect(api.booked, true);
      expect(find.text('Reference: VISIT-001'), findsOneWidget);
      final duplicate = await api.handle(
        '/actions/appointment',
        method: 'POST',
        data: {'patient': 'Other', 'slot': 'slot-10'},
      );
      expect(duplicate['success'], false);
    },
  );
  testWidgets(
    'food journey places an order and applies live delivery updates',
    (tester) async {
      final api = DemoApi();
      final events = StreamController<Map<String, dynamic>>();
      addTearDown(events.close);
      await open(
        tester,
        '/ui/food',
        api,
        streams: {'updates': (_) => events.stream},
      );
      await tap(tester, 'Avocado');
      await tap(tester, 'Place demo order');
      expect(find.text('Status: Preparing'), findsOneWidget);
      api.deliveryStage = 2;
      events.add(api.live('/live/order'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Status: Arriving'), findsOneWidget);
      expect(find.text('Delivery map'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
  testWidgets('messages journey sends content and displays literal user text', (
    tester,
  ) async {
    final api = DemoApi();
    await open(
      tester,
      '/ui/social',
      api,
      streams: {'updates': (_) => const Stream.empty()},
    );
    await tester.enterText(find.byType(TextFormField), 'Hello {{app.secret}}');
    await tap(tester, 'Send message');
    expect(api.messages.last['text'], 'Hello {{app.secret}}');
    expect(find.text('Hello {{app.secret}}'), findsOneWidget);
  });
  testWidgets('admin table sorts numeric rows and stores bulk selection', (
    tester,
  ) async {
    final api = DemoApi();
    await open(tester, '/ui/admin', api);
    await tap(tester, 'Amount');
    expect(
      tester.getTopLeft(find.text('Order B')).dy,
      lessThan(tester.getTopLeft(find.text('Order A')).dy),
    );
    await tester.tap(find.byType(Checkbox).at(1));
    await tester.pump();
    await tester.ensureVisible(find.text('Selected: [2]'));
    expect(find.text('Selected: [2]'), findsOneWidget);
    await tester.tap(find.byTooltip('Next page'));
    await tester.pump();
    expect(find.text('Order C'), findsOneWidget);
  });
  testWidgets(
    'travel journey selects a date range and confirms a reservation',
    (tester) async {
      final api = DemoApi();
      await open(tester, '/ui/travel', api);
      await tester.tap(find.text('Select dates'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('10').first);
      await tester.pump();
      await tester.tap(find.text('12').first);
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), 'Demo guest');
      await tap(tester, 'Reserve demo room');
      expect(find.text('Demo reference: STAY-001'), findsOneWidget);
    },
  );
}
