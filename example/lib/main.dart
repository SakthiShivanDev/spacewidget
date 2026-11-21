import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:spacewidget/spacewidget.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = jsonDecode(
    await rootBundle.loadString('assets/app.json'),
  ) as Map<String, dynamic>;
  runApp(DemoApp(config: config));
}

class DemoApp extends StatelessWidget {
  final Map<String, dynamic> config;
  const DemoApp({super.key, required this.config});

  @override
  Widget build(BuildContext context) => SpaceApp(
    config: config,
    actions: {
      'saveProfile': (event) {
        event.controller.setValue('user.name', event.values['name']);
        ScaffoldMessenger.of(event.context)
            .showSnackBar(const SnackBar(content: Text('Profile saved')));
      },
      'refresh': (event) {
        event.controller.setValue('lastSync', 'Just now');
      },
    },
    widgets: {
      'statusPill': (context) {
        final status =
            context.controller
                .resolve(context.node.props['text'])
                ?.toString() ??
            '';
        return Chip(
          label: Text(status),
          avatar: const Icon(Icons.circle, size: 10),
        );
      },
    },
    onError: (issue) => debugPrint(issue.toString()),
  );
}
