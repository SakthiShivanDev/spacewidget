import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

/// Published commerce template. Keys are publishable; provider secrets and
/// user credentials are never compiled into this app.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SemanticsBinding.instance.ensureSemantics();
  const key = String.fromEnvironment('SPACE_STUDIO_KEY');
  if (key.isEmpty) {
    runApp(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text(
              'Create the commerce demo, then run npm run demo:build in studio.',
            ),
          ),
        ),
      ),
    );
    return;
  }
  runApp(const _CommerceApp());
}

class _CommerceApp extends StatefulWidget {
  const _CommerceApp();
  @override
  State<_CommerceApp> createState() => _CommerceAppState();
}

class _CommerceAppState extends State<_CommerceApp> {
  late final SpaceClient client;
  SpaceAppLinks? links;
  @override
  void initState() {
    super.initState();
    const authReturn = String.fromEnvironment('SPACE_AUTH_RETURN_URL');
    const paymentReturn = String.fromEnvironment('SPACE_PAYMENT_RETURN_URL');
    client = SpaceClient(
      baseUrl: const String.fromEnvironment(
        'SPACE_STUDIO_URL',
        defaultValue: 'http://localhost:4100',
      ),
      apiKey: const String.fromEnvironment('SPACE_STUDIO_KEY'),
      oauthReturnUri: authReturn.isEmpty ? null : Uri.parse(authReturn),
      paymentReturnUri: paymentReturn.isEmpty ? null : Uri.parse(paymentReturn),
    );
    if (authReturn.isNotEmpty || paymentReturn.isNotEmpty) {
      links = SpaceAppLinks(client: client);
    }
  }

  @override
  Widget build(BuildContext context) => SpaceHostedApp.client(client: client);
  @override
  void dispose() {
    links?.dispose();
    client.dispose();
    super.dispose();
  }
}
