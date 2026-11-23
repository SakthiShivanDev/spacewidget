import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';

const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGMQK3nxHxkzkC4AABc3JxECP3cJAAAAAElFTkSuQmCC';

void main() {
  testWidgets(
    'inline PNG renders in Flutter without an HTTP image request and reuses decoded bytes',
    (tester) async {
      final controller = SpaceController(initialState: {'image': png});
      addTearDown(controller.dispose);
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            data: {
              'type': 'image',
              'src': '{{image}}',
              'width': 40,
              'height': 40,
              'semanticLabel': 'Figma artwork',
            },
            controller: controller,
            onError: issues.add,
          ),
        ),
      );
      final first = tester.widget<Image>(find.byType(Image));
      expect(first.image, isA<MemoryImage>());
      expect(first.semanticLabel, 'Figma artwork');
      final bytes = (first.image as MemoryImage).bytes;
      expect(bytes.take(8).toList(), [137, 80, 78, 71, 13, 10, 26, 10]);
      controller.setValue('unrelated', 1);
      await tester.pump();
      final second = tester.widget<Image>(find.byType(Image));
      expect(identical((second.image as MemoryImage).bytes, bytes), isTrue);
      await tester.runAsync(
        () => precacheImage(first.image, tester.element(find.byType(Image))),
      );
      await tester.pumpAndSettle();
      expect(issues, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'unsupported inline image formats report schema issues without crashing',
    (tester) async {
      final issues = <SpaceIssue>[];
      await tester.pumpWidget(
        MaterialApp(
          home: SpaceWidget(
            data: {
              'type': 'image',
              'src':
                  'data:image/svg+xml;base64,${base64Encode(utf8.encode('<svg/>'))}',
            },
            onError: issues.add,
          ),
        ),
      );
      await tester.pump();
      expect(issues.single.message, contains('base64 PNG'));
      expect(tester.takeException(), isNull);
    },
  );
}
