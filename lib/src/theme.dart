import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'renderer.dart';

/// The same theme contract is used by Studio, hosted apps and local JSON apps.
ThemeData buildSpaceTheme(
  dynamic raw, {
  Brightness brightness = Brightness.light,
}) {
  final data = raw is Map ? raw : const {};
  Color? color(String key) => parseSpaceColor(data[key]);
  Color? foreground(String background, String text) {
    final explicit = color(text), fill = color(background);
    return explicit ??
        (fill == null
            ? null
            : fill.computeLuminance() > .179
            ? Colors.black
            : Colors.white);
  }

  var scheme = ColorScheme.fromSeed(
    seedColor: color('seedColor') ?? Colors.indigo,
    brightness: brightness,
  );
  scheme = scheme.copyWith(
    primary: color('primaryColor'),
    onPrimary: foreground('primaryColor', 'onPrimaryColor'),
    secondary: color('secondaryColor'),
    onSecondary: foreground('secondaryColor', 'onSecondaryColor'),
    surface: color('surfaceColor'),
    onSurface: foreground('surfaceColor', 'onSurfaceColor'),
    error: color('errorColor'),
    onError: foreground('errorColor', 'onErrorColor'),
  );
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: spaceFontFamily(data, data['fontFamily'] as String?),
    scaffoldBackgroundColor: color('backgroundColor'),
  );
  final size = data['fontSize'] is num
      ? (data['fontSize'] as num).toDouble()
      : null;
  final radius = data['borderRadius'] is num
      ? (data['borderRadius'] as num).toDouble()
      : null;
  final shape = radius == null
      ? null
      : RoundedRectangleBorder(borderRadius: BorderRadius.circular(radius));
  final buttons = shape == null
      ? null
      : ButtonStyle(shape: WidgetStatePropertyAll(shape));
  return base.copyWith(
    textTheme: size == null
        ? base.textTheme
        : _scaledTextTheme(base, size / 14),
    elevatedButtonTheme: buttons == null
        ? null
        : ElevatedButtonThemeData(style: buttons),
    filledButtonTheme: buttons == null
        ? null
        : FilledButtonThemeData(style: buttons),
    outlinedButtonTheme: buttons == null
        ? null
        : OutlinedButtonThemeData(style: buttons),
    textButtonTheme: buttons == null
        ? null
        : TextButtonThemeData(style: buttons),
    cardTheme: shape == null ? null : CardThemeData(shape: shape),
    inputDecorationTheme: radius == null
        ? null
        : InputDecorationThemeData(
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
          ),
  );
}

TextTheme _scaledTextTheme(ThemeData base, double factor) {
  final styles = base.textTheme, sizes = base.typography.englishLike;
  TextStyle? scale(TextStyle? style, TextStyle? defaults) => style?.copyWith(
    fontSize: (style.fontSize ?? defaults?.fontSize ?? 14) * factor,
  );
  // Preserve each base style's inherit flag so hot theme changes interpolate.
  return TextTheme(
    displayLarge: scale(styles.displayLarge, sizes.displayLarge),
    displayMedium: scale(styles.displayMedium, sizes.displayMedium),
    displaySmall: scale(styles.displaySmall, sizes.displaySmall),
    headlineLarge: scale(styles.headlineLarge, sizes.headlineLarge),
    headlineMedium: scale(styles.headlineMedium, sizes.headlineMedium),
    headlineSmall: scale(styles.headlineSmall, sizes.headlineSmall),
    titleLarge: scale(styles.titleLarge, sizes.titleLarge),
    titleMedium: scale(styles.titleMedium, sizes.titleMedium),
    titleSmall: scale(styles.titleSmall, sizes.titleSmall),
    bodyLarge: scale(styles.bodyLarge, sizes.bodyLarge),
    bodyMedium: scale(styles.bodyMedium, sizes.bodyMedium),
    bodySmall: scale(styles.bodySmall, sizes.bodySmall),
    labelLarge: scale(styles.labelLarge, sizes.labelLarge),
    labelMedium: scale(styles.labelMedium, sizes.labelMedium),
    labelSmall: scale(styles.labelSmall, sizes.labelSmall),
  );
}

/// Dark schemes are generated independently; typography and shape are shared.
Map<String, dynamic> spaceDarkTheme(dynamic raw, dynamic overrides) {
  final data = raw is Map
      ? Map<String, dynamic>.from(raw)
      : <String, dynamic>{};
  for (final key in [
    'primaryColor',
    'onPrimaryColor',
    'secondaryColor',
    'onSecondaryColor',
    'backgroundColor',
    'surfaceColor',
    'onSurfaceColor',
    'errorColor',
    'onErrorColor',
  ]) {
    data.remove(key);
  }
  return {
    ...data,
    if (overrides is Map) ...Map<String, dynamic>.from(overrides),
  };
}

ThemeMode spaceThemeMode(dynamic value) => switch (value) {
  'dark' => ThemeMode.dark,
  'system' => ThemeMode.system,
  _ => ThemeMode.light,
};

final _fontAliases = Expando<Map<String, String>>();
Map<String, String> _aliasesFor(dynamic theme) {
  if (theme is! Map || theme['fonts'] is! List) return const {};
  final cached = _fontAliases[theme['fonts']];
  if (cached != null) return cached;
  final grouped = <String, List<dynamic>>{};
  for (final font in theme['fonts'] as List) {
    if (font is Map && font['family'] is String) {
      grouped.putIfAbsent(font['family'] as String, () => []).add(font);
    }
  }
  final aliases = <String, String>{};
  for (final entry in grouped.entries) {
    var first = 17, second = 23;
    for (final code in jsonEncode(entry.value).codeUnits) {
      first = (first * 31 + code) & 0x7fffffff;
      second = (second * 65599 + code) & 0x7fffffff;
    }
    aliases[entry.key] =
        '${entry.key}__space_${first.toRadixString(16)}_${second.toRadixString(16)}';
  }
  return _fontAliases[theme['fonts']] = aliases;
}

/// Namespaces uploaded families so two hosted apps can use the same family name.
String? spaceFontFamily(dynamic theme, String? family) =>
    _aliasesFor(theme)[family] ?? family;
String? resolveSpaceFontFamily(BuildContext? context, String? family) =>
    context == null
    ? family
    : context
              .dependOnInheritedWidgetOfExactType<_ThemeFontScope>()
              ?.aliases[family] ??
          family;

class _ThemeFontScope extends InheritedWidget {
  final Map<String, String> aliases;
  const _ThemeFontScope({required this.aliases, required super.child});
  @override
  bool updateShouldNotify(_ThemeFontScope oldWidget) =>
      !identical(aliases, oldWidget.aliases);
}

final _fontLoads = <String, Future<void>>{};
Future<void> _loadFonts(dynamic theme) async {
  if (theme is! Map || theme['fonts'] is! List) return;
  final fonts = theme['fonts'] as List;
  if (fonts.length > 12) {
    throw const FormatException('Use up to 12 custom font files.');
  }
  final families = <String, List<Map>>{};
  for (final font in fonts) {
    if (font is! Map || font['family'] is! String || font['data'] is! String) {
      throw const FormatException(
        'Custom fonts require a family and a data URI.',
      );
    }
    families.putIfAbsent(font['family'] as String, () => []).add(font);
  }
  for (final entry in families.entries) {
    final fingerprint = spaceFontFamily(theme, entry.key)!;
    final pending = _fontLoads.putIfAbsent(fingerprint, () async {
      final loader = FontLoader(fingerprint);
      for (final font in entry.value) {
        final data = UriData.parse(font['data'] as String);
        if (!data.isBase64 ||
            (font['data'] as String).length > 3 * 1024 * 1024) {
          throw const FormatException('Use base64 font files under 2 MB.');
        }
        final bytes = data.contentAsBytes();
        if (bytes.length < 4 || bytes.length > 2 * 1024 * 1024) {
          throw const FormatException('Invalid custom font file size.');
        }
        final signature = bytes.take(4).toList();
        if (!(signature[0] == 0 &&
                signature[1] == 1 &&
                signature[2] == 0 &&
                signature[3] == 0) &&
            ascii.decode(signature, allowInvalid: true) != 'OTTO') {
          throw const FormatException('Custom fonts must be TTF or OTF files.');
        }
        loader.addFont(Future.value(ByteData.sublistView(bytes)));
      }
      await loader.load();
    });
    try {
      await pending;
    } catch (_) {
      _fontLoads.remove(fingerprint);
      rethrow;
    }
  }
}

/// Load published font bytes before displaying content, avoiding silent fallback.
class SpaceThemeFonts extends StatefulWidget {
  final dynamic theme;
  final Widget child;
  const SpaceThemeFonts({super.key, required this.theme, required this.child});
  @override
  State<SpaceThemeFonts> createState() => _SpaceThemeFontsState();
}

class _SpaceThemeFontsState extends State<SpaceThemeFonts> {
  late Future<void> _ready;
  @override
  void initState() {
    super.initState();
    _ready = _loadFonts(widget.theme);
  }

  @override
  void didUpdateWidget(covariant SpaceThemeFonts oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (jsonEncode(
          (oldWidget.theme is Map ? oldWidget.theme['fonts'] : null),
        ) !=
        jsonEncode((widget.theme is Map ? widget.theme['fonts'] : null))) {
      _ready = _loadFonts(widget.theme);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.theme is! Map ||
        (widget.theme['fonts'] as List?)?.isNotEmpty != true) {
      return widget.child;
    }
    return FutureBuilder<void>(
      future: _ready,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.done &&
            !snapshot.hasError) {
          return _ThemeFontScope(
            aliases: _aliasesFor(widget.theme),
            child: widget.child,
          );
        }
        return Directionality(
          textDirection: TextDirection.ltr,
          child: Center(
            child: snapshot.hasError
                ? Text('Unable to load app font: ${snapshot.error}')
                : const CircularProgressIndicator(),
          ),
        );
      },
    );
  }
}
