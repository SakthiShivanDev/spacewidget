import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'local_dashboard.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = jsonDecode(
    await rootBundle.loadString('assets/app.json'),
  ) as Map<String, dynamic>;
  runApp(DemoApp(config: config));
}
