import 'dart:async';
import 'dart:collection';

import 'node.dart';

/// Cooperative cancellation. HTTP adapters should forward this to their
/// client's cancellation mechanism; the screen also ignores stale responses.
class SpaceCancellationToken {
  bool _cancelled = false;
  final List<void Function()> _listeners = [];
  bool get isCancelled => _cancelled;
  void onCancel(void Function() listener) {
    if (_cancelled) {
      listener();
    } else {
      _listeners.add(listener);
    }
  }

  void cancel() {
    if (_cancelled) return;
    _cancelled = true;
    for (final listener in List.of(_listeners)) {
      listener();
    }
    _listeners.clear();
  }

  void throwIfCancelled() {
    if (_cancelled) throw const SpaceRequestCancelled();
  }
}

class SpaceRequestCancelled implements Exception {
  const SpaceRequestCancelled();
  @override
  String toString() => 'Request cancelled';
}

/// Logical requests deliberately contain no client credentials. The host's
/// transport supplies base URL, authentication, headers and file encoding.
class SpaceRequest {
  final String source;
  final String method;
  final Map<String, dynamic> query;
  final Map<String, dynamic> data;
  final dynamic arguments;
  final SpaceCancellationToken? cancellation;
  const SpaceRequest({
    required this.source,
    this.method = 'GET',
    this.query = const {},
    this.data = const {},
    this.arguments,
    this.cancellation,
  });
}

typedef SpaceTransport = Future<Map<String, dynamic>> Function(
  SpaceRequest request,
);
typedef SpaceOperation = Future<SpaceResult> Function(SpaceRequest request);
typedef SpaceStreamFactory = Stream<Map<String, dynamic>> Function(
  SpaceRequest request,
);

/// A service result. Only a true success value allows an action sequence to
/// continue. Payment adapters must use server-confirmed outcomes here.
class SpaceResult {
  final bool success;
  final bool cancelled;
  final Map<String, dynamic> data;
  final Map<String, dynamic> state;
  final Map<String, dynamic>? widgets;
  final String? message;
  final dynamic actions;
  SpaceResult({
    required this.success,
    this.cancelled = false,
    Map<String, dynamic> data = const {},
    Map<String, dynamic> state = const {},
    Map<String, dynamic>? widgets,
    this.message,
    this.actions,
  }) : data = freezeJsonMap(data),
       state = freezeJsonMap(state),
       widgets = widgets == null ? null : freezeJsonMap(widgets);

  factory SpaceResult.fromJson(Map<String, dynamic> json) {
    if (json['success'] is! bool) {
      throw const FormatException('response.success must be a boolean');
    }
    final state = json['state'];
    final widgets = json['widgets'];
    if (state != null && state is! Map<String, dynamic>) {
      throw const FormatException('response.state must be an object');
    }
    if (widgets != null && widgets is! Map<String, dynamic>) {
      throw const FormatException('response.widgets must be an object');
    }
    final data = json['data'];
    return SpaceResult(
      success: json['success'],
      state: state ?? {},
      widgets: widgets,
      data: data is Map<String, dynamic> ? data : {'value': data},
      message: json['message']?.toString(),
      actions: json['actions'],
    );
  }
}

/// A single complete screen response. Legacy Connet success/widgets envelopes
/// and raw widget trees are accepted. Remote screens own their local state.
class SpaceDocument {
  final SpaceNode root;
  final Map<String, dynamic> state;
  final String? id;
  final bool bodyOnly;
  final Map<String, dynamic> json;
  SpaceDocument._(this.root, this.state, this.id, this.bodyOnly, this.json);
  factory SpaceDocument.fromJson(Map<String, dynamic> json) {
    if ((json['schemaVersion'] ?? 1) != 1) {
      throw const FormatException('Unsupported screen schemaVersion');
    }
    if (json.containsKey('success') && json['success'] != true) {
      throw SpaceRemoteException(
        json['message']?.toString() ?? 'Unable to load screen',
      );
    }
    final raw = json['widgets'] ?? json;
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('response.widgets must be an object');
    }
    final state = json['state'] ?? const <String, dynamic>{};
    if (state is! Map<String, dynamic>) {
      throw const FormatException('response.state must be an object');
    }
    final node = SpaceNode.fromJson(raw);
    return SpaceDocument._(
      node,
      freezeJsonMap(state),
      json['screenId']?.toString(),
      json['bodyOnly'] == true || node.type != 'scaffold',
      freezeJsonMap(json),
    );
  }
}

class SpaceRemoteException implements Exception {
  final String message;
  const SpaceRemoteException(this.message);
  @override
  String toString() => message;
}

/// Explicit, bounded, in-memory document cache. Scope a services instance to a
/// signed-in session and clear it on logout. Disabled unless a TTL is requested.
class SpaceDocumentCache {
  final int capacity;
  final DateTime Function() _now;
  final LinkedHashMap<String, (DateTime, SpaceDocument)> _entries =
      LinkedHashMap();
  SpaceDocumentCache({this.capacity = 20, DateTime Function()? now})
    : _now = now ?? DateTime.now {
    if (capacity <= 0) throw ArgumentError.value(capacity, 'capacity');
  }
  SpaceDocument? read(String key, Duration ttl) {
    final entry = _entries.remove(key);
    if (entry == null || _now().difference(entry.$1) >= ttl) {
      return null;
    }
    _entries[key] = entry;
    return entry.$2;
  }

  void write(String key, SpaceDocument document) {
    _entries.remove(key);
    _entries[key] = (_now(), document);
    while (_entries.length > capacity) {
      _entries.remove(_entries.keys.first);
    }
  }

  void clear() => _entries.clear();
}

/// Optional app/session-scoped persistence for explicitly cacheable documents.
abstract interface class SpaceDocumentStorage {
  Future<Map<String, dynamic>?> read(String key);
  Future<void> write(String key, Map<String, dynamic> document);
  Future<void> clear();
}

/// The host supplies transport, native operations and live data factories.
/// No credentials or implementation code need to appear in screen JSON.
class SpaceServices {
  final SpaceTransport transport;
  final Map<String, SpaceOperation> operations;
  final Map<String, SpaceStreamFactory> streams;
  final Duration timeout;
  final SpaceDocumentCache? cache;
  final SpaceDocumentStorage? storage;
  const SpaceServices({
    required this.transport,
    this.operations = const {},
    this.streams = const {},
    this.timeout = const Duration(seconds: 30),
    this.cache,
    this.storage,
  });

  Future<Map<String, dynamic>> send(SpaceRequest request) async {
    if (request.source.trim().isEmpty) {
      throw const FormatException('request.source is required');
    }
    request.cancellation?.throwIfCancelled();
    final response = await transport(request).timeout(
      timeout,
      onTimeout: () {
        request.cancellation?.cancel();
        throw TimeoutException('Request timed out', timeout);
      },
    );
    request.cancellation?.throwIfCancelled();
    return response;
  }

  Future<SpaceResult> execute(SpaceRequest request, {String? operation}) async {
    request.cancellation?.throwIfCancelled();
    final SpaceResult result;
    if (operation != null) {
      final handler = operations[operation];
      if (handler == null) {
        throw StateError('No operation registered for "$operation"');
      }
      result = await handler(request).timeout(
        timeout,
        onTimeout: () {
          request.cancellation?.cancel();
          throw TimeoutException('Operation timed out', timeout);
        },
      );
    } else {
      result = SpaceResult.fromJson(await send(request));
    }
    request.cancellation?.throwIfCancelled();
    return result;
  }
}
