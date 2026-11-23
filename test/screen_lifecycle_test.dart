import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  testWidgets(
    'screen opening function receives parameters once and survives refresh without replaying',
    (tester) async {
      final requests = <SpaceRequest>[];
      final handle = SpaceScreenController();
      Completer<Map<String, dynamic>>? refresh;
      final services = SpaceServices(
        transport: (request) async {
          requests.add(request);
          if (request.source == '/runtime/functions/welcome') {
            return {
              'success': true,
              'data': {'message': 'Opened ${request.data['productId']}'},
            };
          }
          if (refresh != null) return refresh.future;
          return {
            'screenId': 'detail',
            'state': {
              'params': {'productId': request.query['productId']},
            },
            'onLoad': {
              'type': 'request',
              'method': 'POST',
              'source': '/runtime/functions/welcome',
              'data': {'productId': '{{params.productId}}'},
              'resultPath': 'welcome',
            },
            'widgets': {
              'type': 'scaffold',
              'body': {'type': 'text', 'text': '{{welcome.message}}'},
            },
          };
        },
      );
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceRemoteScreen(
            source: '/detail',
            query: const {'productId': 'p2'},
            services: services,
            screenController: handle,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Opened p2'), findsOneWidget);
      expect(requests.where((r) => r.source.contains('/functions/')).length, 1);
      refresh = Completer();
      final pending = handle.refresh();
      await tester.pump();
      expect(find.text('Opened p2'), findsOneWidget);
      refresh.complete({
        'screenId': 'detail',
        'state': {
          'params': {'productId': 'p2'},
        },
        'onLoad': {'type': 'snackbar', 'message': 'Must not repeat'},
        'widgets': {
          'type': 'scaffold',
          'body': {'type': 'text', 'text': '{{welcome.message}}'},
        },
      });
      await pending;
      await tester.pumpAndSettle();
      expect(find.text('Opened p2'), findsOneWidget);
      expect(find.text('Must not repeat'), findsNothing);
      expect(requests.where((r) => r.source.contains('/functions/')).length, 1);
      await tester.pumpWidget(const SizedBox());
      handle.dispose();
    },
  );
}
