import 'package:flutter/material.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

/// Run with SPACE_STUDIO_URL and a published SPACE_STUDIO_KEY dart define.
void main() {
  const baseUrl = String.fromEnvironment(
    'SPACE_STUDIO_URL',
    defaultValue: 'http://localhost:4100',
  );
  const apiKey = String.fromEnvironment('SPACE_STUDIO_KEY');
  if (apiKey.isEmpty) {
    runApp(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text('Set --dart-define=SPACE_STUDIO_KEY to your app key.'),
          ),
        ),
      ),
    );
    return;
  }
  runApp(const SpaceHostedApp(baseUrl: baseUrl, apiKey: apiKey));
}
