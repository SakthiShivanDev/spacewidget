import 'package:flutter/material.dart';

import 'controller.dart';
import 'network.dart';
import 'renderer.dart';

/// Material app with inline JSON routes and API-backed route descriptors.
/// Use `initialSource` in config for a single-request startup screen. Remote
/// screens have isolated local state and access shared state via `app.*`.
class SpaceApp extends StatefulWidget {
  final Map<String, dynamic> config;
  final SpaceServices? services;
  final SpaceController? controller;
  final Map<String, SpaceWidgetBuilder> widgets;
  final Map<String, SpaceActionHandler> actions;
  final SpaceActionHandler? onAction;
  final ValueChanged<SpaceIssue>? onError;
  final SpaceErrorBuilder? errorBuilder;
  final GlobalKey<NavigatorState>? navigatorKey;
  final Iterable<LocalizationsDelegate<dynamic>>? localizationsDelegates;
  final Iterable<Locale> supportedLocales;
  final Locale? locale;
  final String? restorationScopeId;
  const SpaceApp({
    super.key,
    required this.config,
    this.services,
    this.controller,
    this.widgets = const {},
    this.actions = const {},
    this.onAction,
    this.onError,
    this.errorBuilder,
    this.navigatorKey,
    this.localizationsDelegates,
    this.supportedLocales = const [Locale('en', 'US')],
    this.locale,
    this.restorationScopeId,
  });
  @override
  State<SpaceApp> createState() => _SpaceAppState();
}

class _SpaceAppState extends State<SpaceApp> {
  late SpaceController _controller;
  final _revision = ValueNotifier<int>(0);
  SpaceController _createController() =>
      widget.controller ??
      SpaceController(
        initialState: Map<String, dynamic>.from(
          widget.config['state'] as Map? ?? {},
        ),
      );
  @override
  void initState() {
    super.initState();
    _controller = _createController();
  }

  @override
  void didUpdateWidget(covariant SpaceApp oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.controller != oldWidget.controller) {
      if (oldWidget.controller == null) _controller.dispose();
      _controller = _createController();
    }
    _revision.value++;
  }

  @override
  void dispose() {
    if (widget.controller == null) _controller.dispose();
    _revision.dispose();
    super.dispose();
  }

  Widget _screen(BuildContext context, RouteSettings settings) {
    final config = widget.config;
    final routes = config['routes'] as Map? ?? const {};
    final initial = config['initialRoute']?.toString() ?? '/';
    final raw =
        routes[settings.name] ??
        (settings.name == initial && config['initialSource'] != null
            ? {'source': config['initialSource']}
            : null);
    if (raw is! Map<String, dynamic>) {
      final issue = SpaceIssue(
        'routes.${settings.name}',
        'Route is missing or invalid',
      );
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onError?.call(issue);
      });
      return Scaffold(
        body: Center(
          child:
              widget.errorBuilder?.call(context, issue) ??
              const Text('Screen not found'),
        ),
      );
    }
    if (raw['source'] != null &&
        raw['type'] == null &&
        raw['widgetType'] == null) {
      final services = widget.services;
      if (services == null) {
        throw StateError('Remote routes require SpaceServices');
      }
      return SpaceRemoteScreen(
        key: ValueKey(settings.name),
        source: raw['source'].toString(),
        method: raw['method']?.toString() ?? 'GET',
        query: Map<String, dynamic>.from(raw['query'] as Map? ?? {}),
        data: Map<String, dynamic>.from(raw['data'] as Map? ?? {}),
        arguments: settings.arguments,
        services: services,
        appController: _controller,
        offlineFallback: raw['offlineFallback'] == true,
        cacheTtl: Duration(seconds: (raw['cacheSeconds'] as num? ?? 0).toInt()),
        widgets: widget.widgets,
        actions: widget.actions,
        onAction: widget.onAction,
        onError: widget.onError,
        errorBuilder: widget.errorBuilder,
      );
    }
    return SpaceWidget(
      key: ValueKey(settings.name),
      data: raw,
      controller: _controller,
      services: widget.services,
      widgets: widget.widgets,
      actions: widget.actions,
      onAction: widget.onAction,
      onError: widget.onError,
      errorBuilder: widget.errorBuilder,
    );
  }

  @override
  Widget build(BuildContext context) {
    final config = widget.config;
    if ((config['schemaVersion'] ?? 1) != 1) {
      throw const FormatException('Unsupported SpaceApp schemaVersion');
    }
    final routes = config['routes'];
    if (routes != null && routes is! Map) {
      throw const FormatException('SpaceApp.routes must be an object');
    }
    final initial = config['initialRoute']?.toString() ?? '/';
    if (!(routes is Map && routes.containsKey(initial)) &&
        config['initialSource'] == null) {
      throw FormatException(
        'initialRoute "$initial" has no route or initialSource',
      );
    }
    ThemeData theme(dynamic raw, Brightness brightness) {
      final data = raw is Map ? raw : const {};
      return ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: parseSpaceColor(data['seedColor']) ?? Colors.indigo,
          brightness: brightness,
        ),
        fontFamily: data['fontFamily'] as String?,
        scaffoldBackgroundColor: parseSpaceColor(data['backgroundColor']),
      );
    }

    Route<dynamic> route(RouteSettings settings) => MaterialPageRoute<dynamic>(
      settings: settings,
      builder: (context) => ValueListenableBuilder<int>(
        valueListenable: _revision,
        builder: (context, _, _) => _screen(context, settings),
      ),
    );
    return MaterialApp(
      title: config['title']?.toString() ?? 'SpaceWidget',
      navigatorKey: widget.navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: theme(config['theme'], Brightness.light),
      darkTheme: theme(config['darkTheme'] ?? config['theme'], Brightness.dark),
      themeMode: switch (config['themeMode']) {
        'dark' => ThemeMode.dark,
        'system' => ThemeMode.system,
        _ => ThemeMode.light,
      },
      localizationsDelegates: widget.localizationsDelegates,
      supportedLocales: widget.supportedLocales,
      locale: widget.locale,
      restorationScopeId: widget.restorationScopeId,
      initialRoute: initial,
      onGenerateInitialRoutes: (name) => [route(RouteSettings(name: name))],
      onGenerateRoute: route,
    );
  }
}
