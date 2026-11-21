part of 'renderer.dart';

class _Props {
  final Map<String, dynamic> values;
  final SpaceController controller;
  _Props(this.values, this.controller);
  dynamic raw(String key) => values[key];
  dynamic get(String key, [dynamic fallback]) =>
      controller.resolve(values[key]) ?? fallback;
  String string(String key, [String fallback = '']) => '${get(key, fallback)}';
  bool boolean(String key, [bool fallback = false]) {
    final value = get(key);
    if (value == null) return fallback;
    if (value is! bool) throw FormatException('$key must be a boolean');
    return value;
  }

  double? number(String key, [double? fallback]) {
    final value = get(key);
    if (value == null) return fallback;
    if (value == 'infinity') return double.infinity;
    if (value is! num || !value.isFinite) {
      throw FormatException('$key must be a finite number');
    }
    return value.toDouble();
  }

  double positive(String key, double fallback, {bool zero = true}) {
    final value = number(key, fallback)!;
    if (!value.isFinite || (zero ? value < 0 : value <= 0)) {
      throw FormatException(
        '$key must be ${zero ? 'nonnegative' : 'positive'} and finite',
      );
    }
    return value;
  }

  int integer(String key, int fallback) {
    final value = number(key, fallback.toDouble())!;
    if (!value.isFinite || value != value.roundToDouble()) {
      throw FormatException('$key must be an integer');
    }
    return value.toInt();
  }

  List<dynamic> list(String key) {
    final value = get(key, const []);
    if (value is! List) throw FormatException('$key must be a list');
    return value;
  }

  Color? color(String key, [Color? fallback]) =>
      parseSpaceColor(get(key)) ?? fallback;
  EdgeInsets insets(String key, [double fallback = 0]) {
    final value = get(key);
    if (value == null) return EdgeInsets.all(fallback);
    if (value is num && value >= 0 && value.isFinite) {
      return EdgeInsets.all(value.toDouble());
    }
    if (value is Map<String, dynamic>) {
      final props = _Props(value, controller);
      return EdgeInsets.fromLTRB(
        props.positive('left', props.positive('horizontal', 0)),
        props.positive('top', props.positive('vertical', 0)),
        props.positive('right', props.positive('horizontal', 0)),
        props.positive('bottom', props.positive('vertical', 0)),
      );
    }
    throw FormatException(
      '$key must be nonnegative padding or an inset object',
    );
  }

  TextStyle get textStyle {
    final weight = integer('fontWeight', 400);
    final weights = <int, FontWeight>{
      100: FontWeight.w100,
      200: FontWeight.w200,
      300: FontWeight.w300,
      400: FontWeight.w400,
      500: FontWeight.w500,
      600: FontWeight.w600,
      700: FontWeight.w700,
      800: FontWeight.w800,
      900: FontWeight.w900,
    };
    return TextStyle(
      fontSize: number('fontSize'),
      fontWeight: weights[weight],
      color: color('color'),
      fontFamily: get('fontFamily') as String?,
      fontStyle: boolean('italic') ? FontStyle.italic : FontStyle.normal,
      letterSpacing: number('letterSpacing'),
      height: number('lineHeight'),
      decoration: switch (get('decoration')) {
        'underline' => TextDecoration.underline,
        'lineThrough' => TextDecoration.lineThrough,
        _ => null,
      },
    );
  }

  MainAxisAlignment get mainAxis =>
      switch (get('mainAxisAlignment', get('mainAxis'))) {
        'end' => MainAxisAlignment.end,
        'center' => MainAxisAlignment.center,
        'spaceBetween' || 'between' => MainAxisAlignment.spaceBetween,
        'spaceAround' || 'around' => MainAxisAlignment.spaceAround,
        'spaceEvenly' || 'evenly' => MainAxisAlignment.spaceEvenly,
        _ => MainAxisAlignment.start,
      };
  CrossAxisAlignment get crossAxis =>
      switch (get('crossAxisAlignment', get('crossAxis'))) {
        'start' => CrossAxisAlignment.start,
        'end' => CrossAxisAlignment.end,
        'stretch' => CrossAxisAlignment.stretch,
        _ => CrossAxisAlignment.center,
      };
  Axis get axis => get('direction', get('mainAxis')) == 'horizontal'
      ? Axis.horizontal
      : Axis.vertical;
  Alignment get alignment => switch (get('alignment')) {
    'topLeft' => Alignment.topLeft,
    'topCenter' => Alignment.topCenter,
    'topRight' => Alignment.topRight,
    'centerLeft' => Alignment.centerLeft,
    'centerRight' => Alignment.centerRight,
    'bottomLeft' => Alignment.bottomLeft,
    'bottomCenter' => Alignment.bottomCenter,
    'bottomRight' => Alignment.bottomRight,
    _ => Alignment.center,
  };
  BorderRadius get radius => BorderRadius.circular(positive('borderRadius', 0));
  BoxFit get fit => switch (get('fit')) {
    'cover' => BoxFit.cover,
    'fill' => BoxFit.fill,
    'fitWidth' => BoxFit.fitWidth,
    'fitHeight' => BoxFit.fitHeight,
    'none' => BoxFit.none,
    'scaleDown' => BoxFit.scaleDown,
    _ => BoxFit.contain,
  };
  TextAlign get textAlign => switch (get('textAlign')) {
    'center' => TextAlign.center,
    'right' => TextAlign.right,
    'end' => TextAlign.end,
    'justify' => TextAlign.justify,
    'left' => TextAlign.left,
    _ => TextAlign.start,
  };
}

/// Accepts RGB/ARGB hex strings (`#RRGGBB`, `#AARRGGBB`), short RGB hex,
/// integer ARGB values, and a small documented set of Material color names.
Color? parseSpaceColor(dynamic value) {
  if (value == null) return null;
  if (value is int) return Color(value);
  const names = <String, Color>{
    'transparent': Colors.transparent,
    'black': Colors.black,
    'white': Colors.white,
    'red': Colors.red,
    'green': Colors.green,
    'blue': Colors.blue,
    'grey': Colors.grey,
    'orange': Colors.orange,
    'purple': Colors.purple,
    'teal': Colors.teal,
  };
  if (value is! String) {
    throw const FormatException('color must be a hex string or ARGB integer');
  }
  if (names.containsKey(value)) return names[value];
  var hex = value.replaceFirst(RegExp(r'^(#|0x)'), '');
  if (hex.length == 3) hex = hex.split('').map((c) => '$c$c').join();
  if (!RegExp(r'^[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$').hasMatch(hex)) {
    throw FormatException('invalid color "$value"');
  }
  if (hex.length == 6) hex = 'FF$hex';
  return Color(int.parse(hex, radix: 16));
}

/// Stable icon names; numeric code points are intentionally not accepted so
/// consumers retain Flutter's icon tree shaking support.
const spaceIcons = <String, IconData>{
  'home': Icons.home_outlined,
  'menu': Icons.menu,
  'back': Icons.arrow_back,
  'close': Icons.close,
  'add': Icons.add,
  'remove': Icons.remove,
  'check': Icons.check,
  'search': Icons.search,
  'settings': Icons.settings_outlined,
  'person': Icons.person_outline,
  'people': Icons.people_outline,
  'favorite': Icons.favorite_outline,
  'star': Icons.star_outline,
  'notifications': Icons.notifications_outlined,
  'email': Icons.email_outlined,
  'phone': Icons.phone_outlined,
  'lock': Icons.lock_outline,
  'visibility': Icons.visibility_outlined,
  'edit': Icons.edit_outlined,
  'delete': Icons.delete_outline,
  'share': Icons.share_outlined,
  'download': Icons.download_outlined,
  'upload': Icons.upload_outlined,
  'image': Icons.image_outlined,
  'info': Icons.info_outline,
  'warning': Icons.warning_amber_outlined,
  'error': Icons.error_outline,
  'calendar': Icons.calendar_today_outlined,
  'time': Icons.access_time,
  'location': Icons.location_on_outlined,
  'shoppingCart': Icons.shopping_cart_outlined,
  'payment': Icons.payment_outlined,
  'dashboard': Icons.dashboard_outlined,
  'list': Icons.list,
  'grid': Icons.grid_view,
  'logout': Icons.logout,
  'chevronRight': Icons.chevron_right,
  'expandMore': Icons.expand_more,
  'more': Icons.more_vert,
  'refresh': Icons.refresh,
};
