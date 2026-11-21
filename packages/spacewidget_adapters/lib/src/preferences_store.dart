import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';
import 'package:spacewidget/spacewidget.dart';

/// Opt-in persistence for public or otherwise cache-approved screen documents.
/// Give each account its own namespace and clear the namespace on sign-out.
/// This store is not encrypted and must not hold secrets or clinical records.
class SpacePreferencesDocumentStore implements SpaceDocumentStorage {
  final String namespace;
  final int capacity;
  final SharedPreferencesAsync preferences;
  SpacePreferencesDocumentStore({
    required this.namespace,
    this.capacity = 20,
    SharedPreferencesAsync? preferences,
  }) : preferences = preferences ?? SharedPreferencesAsync() {
    if (namespace.isEmpty || capacity < 1) {
      throw ArgumentError('namespace and positive capacity are required');
    }
  }
  String get _prefix =>
      'spacewidget:${base64UrlEncode(utf8.encode(namespace))}:';
  String _key(String key) => '$_prefix${base64UrlEncode(utf8.encode(key))}';
  @override
  Future<Map<String, dynamic>?> read(String key) async {
    final raw = await preferences.getString(_key(key));
    if (raw == null) return null;
    final value = jsonDecode(raw);
    return value is Map<String, dynamic>
        ? Map<String, dynamic>.from(value['document'] as Map)
        : null;
  }

  @override
  Future<void> write(String key, Map<String, dynamic> document) async {
    await preferences.setString(
      _key(key),
      jsonEncode({
        'savedAt': DateTime.now().toUtc().toIso8601String(),
        'document': document,
      }),
    );
    final keys = (await preferences.getKeys())
        .where((key) => key.startsWith(_prefix))
        .toList();
    if (keys.length <= capacity) return;
    final entries = <(String, String)>[];
    for (final key in keys) {
      final raw = await preferences.getString(key);
      if (raw != null) {
        entries.add((key, '${(jsonDecode(raw) as Map)['savedAt']}'));
      }
    }
    entries.sort((a, b) => a.$2.compareTo(b.$2));
    for (final entry in entries.take(entries.length - capacity)) {
      await preferences.remove(entry.$1);
    }
  }

  @override
  Future<void> clear() async {
    for (final key in (await preferences.getKeys()).where(
      (key) => key.startsWith(_prefix),
    )) {
      await preferences.remove(key);
    }
  }
}
