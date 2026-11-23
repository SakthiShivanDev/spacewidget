import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

void main() {
  testWidgets(
    'node observation preserves parent data and reports actual layout contexts',
    (tester) async {
      final observed = <String, BuildContext>{};
      final data = <String, dynamic>{
        'type': 'scaffold',
        'id': 'screen',
        'appBar': {'type': 'appBar', 'id': 'bar', 'title': 'Observed'},
        'body': {
          'type': 'column',
          'id': 'column',
          'children': [
            {
              'type': 'expanded',
              'id': 'flex',
              'child': {
                'type': 'stack',
                'id': 'stack',
                'children': [
                  {
                    'type': 'positioned',
                    'id': 'position',
                    'left': 10,
                    'top': 10,
                    'child': {
                      'type': 'text',
                      'id': 'label',
                      'text': 'Selection',
                    },
                  },
                ],
              },
            },
            {
              'type': 'sizedBox',
              'height': 80,
              'child': {
                'type': 'customScrollView',
                'id': 'scroll',
                'children': [
                  {
                    'type': 'sliverToBoxAdapter',
                    'id': 'sliver',
                    'child': {
                      'type': 'text',
                      'id': 'sliver-label',
                      'text': 'Sliver',
                    },
                  },
                ],
              },
            },
          ],
        },
      };
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            data: data,
            onNodeBuilt: (node, context) {
              if (node.id != null) observed[node.id!] = context;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      for (final id in [
        'screen',
        'bar',
        'column',
        'flex',
        'stack',
        'position',
        'label',
        'scroll',
        'sliver',
        'sliver-label',
      ]) {
        expect(observed[id]?.mounted, isTrue, reason: id);
        expect(observed[id]?.findRenderObject(), isNotNull, reason: id);
      }
      final label = observed['label']!.findRenderObject()! as RenderBox;
      expect(label.size.width, greaterThan(0));
      final bar = observed['bar']!.findRenderObject()! as RenderBox;
      expect(bar.size.height, greaterThan(0));
    },
  );
}
