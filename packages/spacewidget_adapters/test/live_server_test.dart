import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

class _RealHttp extends HttpOverrides {}

void main() {
  test('real hosted API and Flutter client load, register, update, restore and revoke sessions', () async {
    final node = Platform.environment['STUDIO_NODE_BIN'] ?? 'node';
    final version = await Process.run(node, ['--version']);
    if (int.parse('${version.stdout}'.trim().substring(1).split('.').first) <
        24) {
      markTestSkipped('Node 24+ is required for the live Studio integration.');
      return;
    }
    final fixture = File(
      '${Directory.current.parent.parent.path}/studio/test/live-fixture.mjs',
    );
    if (!fixture.existsSync()) {
      markTestSkipped('Run this test from the repository adapter package.');
      return;
    }
    final process = await Process.start(node, [fixture.path]);
    addTearDown(() async {
      process.kill();
      await process.exitCode;
    });
    final errors = StringBuffer();
    process.stderr.transform(utf8.decoder).listen(errors.write);
    final line = await process.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .first
        .timeout(const Duration(seconds: 10));
    final config = Map<String, dynamic>.from(jsonDecode(line) as Map),
        store = SpaceMemorySessionStore();
    await HttpOverrides.runWithHttpOverrides(() async {
      final client = SpaceClient(
        baseUrl: config['baseUrl'],
        apiKey: config['apiKey'],
        sessionStore: store,
      );
      addTearDown(client.dispose);
      final start = await client.services.send(
        const SpaceRequest(source: '/runtime/start'),
      );
      expect(start['screenId'], 'main');
      expect((start['state'] as Map)['products'], hasLength(3));
      expect(client.title, 'SDK integration');
      final registered = await client.register(
        name: 'Alice',
        email: 'alice@example.com',
        password: 'integration-password',
      );
      expect(registered.success, true);
      expect(registered.data.containsKey('accessToken'), false);
      final profile = await client.services.send(
        const SpaceRequest(source: '/runtime/screens/profile'),
      );
      expect((profile['state'] as Map)['user']['name'], 'Alice');
      final saved = await client.services.execute(
        const SpaceRequest(
          source: '/runtime/actions/save-profile',
          method: 'POST',
          data: {'name': 'Alice Updated'},
        ),
      );
      expect(saved.success, true);
      final restored = SpaceClient(
        baseUrl: config['baseUrl'],
        apiKey: config['apiKey'],
        sessionStore: store,
      );
      addTearDown(restored.dispose);
      await restored.initialize();
      expect(restored.signedIn, true);
      final updated = await restored.services.send(
        const SpaceRequest(source: '/runtime/screens/profile'),
      );
      expect((updated['state'] as Map)['user']['name'], 'Alice Updated');
      await restored.logout();
      final challenge = await client.services.send(
        const SpaceRequest(source: '/runtime/screens/profile'),
      );
      expect(jsonEncode(challenge['widgets']), contains('loginForm'));
      expect(client.signedIn, false);
    }, _RealHttp());
    expect(errors.toString(), isNot(contains('Error:')));
  });
}
