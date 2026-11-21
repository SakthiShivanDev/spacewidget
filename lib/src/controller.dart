import 'package:flutter/foundation.dart';

import 'node.dart';

/// Shared screen state. Bind with `bind: "user.name"` and interpolate using
/// `"Hello {{user.name}}"`. Exact bindings preserve numbers, booleans and lists.
class SpaceController extends ChangeNotifier {
  Map<String, dynamic> _state;
  final SpaceController? parent;
  SpaceController({Map<String, dynamic> initialState = const {}, this.parent})
    : _state = freezeJsonMap(initialState) {
    parent?.addListener(notifyListeners);
  }

  SpaceController get appController => parent?.appController ?? this;

  /// Apply a patch with one notification. Missing local keys remain intact.
  void patch(Map<String, dynamic> values) {
    _state = freezeJsonMap({..._state, ...values});
    notifyListeners();
  }

  @override
  void dispose() {
    parent?.removeListener(notifyListeners);
    super.dispose();
  }

  Map<String, dynamic> get state => _state;

  dynamic read(String path, [dynamic fallback]) {
    if (parent != null && path.startsWith('app.')) {
      return appController.read(path.substring(4), fallback);
    }
    dynamic value = _state;
    for (final part in path.split('.')) {
      if (value is Map && value.containsKey(part)) {
        value = value[part];
      } else {
        return fallback;
      }
    }
    return value;
  }

  void setValue(String path, dynamic value) {
    if (parent != null && path.startsWith('app.')) {
      appController.setValue(path.substring(4), value);
      return;
    }
    final parts = path.split('.');
    if (parts.any((part) => part.isEmpty)) {
      throw ArgumentError.value(path, 'path', 'must contain nonempty keys');
    }
    Map<String, dynamic> update(Map<String, dynamic> source, int index) {
      final result = Map<String, dynamic>.from(source);
      if (index == parts.length - 1) {
        result[parts[index]] = value;
      } else {
        final previous = source[parts[index]];
        result[parts[index]] = update(
          previous is Map<String, dynamic> ? previous : {},
          index + 1,
        );
      }
      return result;
    }

    _state = freezeJsonMap(update(_state, 0));
    notifyListeners();
  }

  void reset([Map<String, dynamic> values = const {}]) {
    _state = freezeJsonMap(values);
    notifyListeners();
  }

  dynamic resolve(dynamic value) {
    if (value is! String) return value;
    final exact = RegExp(r'^\{\{\s*([^{}]+?)\s*\}\}$').firstMatch(value);
    if (exact != null) return read(exact.group(1)!.trim());
    return value.replaceAllMapped(
      RegExp(r'\{\{\s*([^{}]+?)\s*\}\}'),
      (match) => '${read(match.group(1)!.trim(), '') ?? ''}',
    );
  }
}
