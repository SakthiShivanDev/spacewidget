/// An immutable widget description. Both `type` and Connet's `widgetType`
/// are accepted. Properties in `props` override top-level and legacy `style`.
class SpaceNode {
  final String type;
  final String? id;
  final Map<String, dynamic> props;
  final SpaceNode? child;
  final List<SpaceNode> children;
  final String path;

  const SpaceNode._({
    required this.type,
    required this.id,
    required this.props,
    required this.child,
    required this.children,
    required this.path,
  });

  factory SpaceNode.fromJson(
    Map<String, dynamic> json, {
    String path = r'$',
    int maxDepth = 64,
  }) => _parse(json, path, maxDepth);

  static SpaceNode _parse(
    Map<String, dynamic> json,
    String path,
    int remaining,
  ) {
    if (remaining <= 0) {
      throw FormatException('$path: maximum widget depth exceeded');
    }
    final type = json['type'] ?? json['widgetType'];
    if (type is! String || type.isEmpty) {
      throw FormatException('$path.type: expected a nonempty string');
    }
    final style = json['style'];
    final props = json['props'];
    if (style != null && style is! Map) {
      throw FormatException('$path.style: expected an object');
    }
    if (props != null && props is! Map) {
      throw FormatException('$path.props: expected an object');
    }
    if (json['id'] != null && json['id'] is! String) {
      throw FormatException('$path.id: expected a string');
    }
    final children = json['children'];
    if (children != null && children is! List) {
      throw FormatException('$path.children: expected a list');
    }
    SpaceNode parseChild(dynamic value, String childPath) {
      if (value is! Map<String, dynamic>) {
        throw FormatException('$childPath: expected an object');
      }
      return _parse(value, childPath, remaining - 1);
    }

    final top = Map<String, dynamic>.from(json)
      ..removeWhere(
        (k, _) => const [
          'type',
          'widgetType',
          'id',
          'child',
          'children',
          'style',
          'props',
        ].contains(k),
      );
    return SpaceNode._(
      type: type,
      id: json['id'] as String?,
      path: path,
      props: freezeJsonMap({
        if (style is Map) ...Map<String, dynamic>.from(style),
        ...top,
        if (props is Map) ...Map<String, dynamic>.from(props),
      }),
      child: json['child'] == null
          ? null
          : parseChild(json['child'], '$path.child'),
      children: List.unmodifiable([
        if (children is List)
          for (var i = 0; i < children.length; i++)
            parseChild(children[i], '$path.children[$i]'),
      ]),
    );
  }
}

/// Copies and freezes JSON collections so callers cannot mutate live state.
Map<String, dynamic> freezeJsonMap(Map<String, dynamic> value) =>
    Map.unmodifiable(value.map((key, value) => MapEntry(key, _freeze(value))));

dynamic _freeze(dynamic value) {
  if (value is Map<String, dynamic>) return freezeJsonMap(value);
  if (value is List) return List.unmodifiable(value.map(_freeze));
  return value;
}
