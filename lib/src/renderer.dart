import 'dart:async';
import 'dart:convert';
import 'dart:ui' show SemanticsRole;

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';

import 'controller.dart';
import 'node.dart';
import 'network.dart';
import 'theme.dart';

part 'properties.dart';
part 'widgets.dart';
part 'forms.dart';
part 'remote_screen.dart';
part 'advanced_widgets.dart';

/// A recoverable schema, rendering, or action error with its JSON location.
class SpaceIssue {
  final String path;
  final String message;
  const SpaceIssue(this.path, this.message);
  @override
  String toString() => '$path: $message';
}

typedef SpaceWidgetBuilder = Widget Function(SpaceBuildContext context);
typedef SpaceActionHandler = FutureOr<void> Function(SpaceActionEvent event);
typedef SpaceErrorBuilder = Widget Function(
  BuildContext context,
  SpaceIssue issue,
);

/// Observes a node at its actual build location without inserting render objects.
/// Editors can read geometry from [context] after the frame has been laid out.
/// The context is only valid while mounted. This callback never runs unless set.
typedef SpaceNodeObserver = void Function(SpaceNode node, BuildContext context);

/// Context supplied to a registered custom widget builder.
class SpaceBuildContext {
  final BuildContext context;
  final SpaceNode node;
  final SpaceController controller;
  final Widget Function(SpaceNode node) build;
  final Future<void> Function(dynamic action) dispatch;
  final void Function(String name, dynamic value) saveFormValue;

  /// Reads a property with the same typed bindings as built-in widgets.
  dynamic read(String key, [dynamic fallback]) {
    dynamic resolve(dynamic value) {
      if (value is Map) {
        return value.map((key, item) => MapEntry(key, resolve(item)));
      }
      if (value is List) return value.map(resolve).toList();
      return controller.resolve(value);
    }

    return resolve(node.props[key]) ?? fallback;
  }

  const SpaceBuildContext({
    required this.context,
    required this.node,
    required this.controller,
    required this.build,
    required this.dispatch,
    required this.saveFormValue,
  });
}

/// Registers named, compiled Dart widgets for Studio's customWidget layers.
/// Downloaded JSON chooses a name; only builders compiled into the host execute.
Map<String, SpaceWidgetBuilder> spaceCustomWidgets(
  Map<String, SpaceWidgetBuilder> builders,
) => {
  'customWidget': (space) {
    final name = space.read('name', '').toString();
    final builder = builders[name];
    if (builder == null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Text('Custom widget "$name" requires a compiled host builder.'),
      );
    }
    return builder(space);
  },
};

/// Host callbacks receive resolved action data and validated form values.
class SpaceActionEvent {
  final BuildContext context;
  final SpaceNode node;
  final SpaceController controller;
  final Map<String, dynamic> action;
  final Map<String, dynamic> values;
  const SpaceActionEvent({
    required this.context,
    required this.node,
    required this.controller,
    required this.action,
    this.values = const {},
  });
}

/// Supplies a refresh handler when rendering a screen in a custom host/editor.
/// API-backed remote screens retain their own isolated refresh behavior.
class SpaceRefreshScope extends InheritedWidget {
  final Future<void> Function() onRefresh;
  const SpaceRefreshScope({
    super.key,
    required this.onRefresh,
    required super.child,
  });
  @override
  bool updateShouldNotify(SpaceRefreshScope oldWidget) =>
      onRefresh != oldWidget.onRefresh;
}

/// Renders one JSON tree. An externally supplied controller remains owned by
/// the caller. Forms and their keys are isolated to this renderer instance.
class SpaceWidget extends StatefulWidget {
  final Map<String, dynamic>? data;
  final SpaceNode? node;
  final SpaceController? controller;
  final SpaceServices? services;
  final Map<String, SpaceWidgetBuilder> widgets;
  final Map<String, SpaceActionHandler> actions;
  final SpaceActionHandler? onAction;
  final ValueChanged<SpaceIssue>? onError;
  final SpaceErrorBuilder? errorBuilder;
  final SpaceNodeObserver? onNodeBuilt;

  /// Runs once after this screen instance first renders. Refreshes do not rerun it.
  final dynamic onLoad;

  const SpaceWidget({
    super.key,
    required Map<String, dynamic> this.data,
    this.controller,
    this.services,
    this.widgets = const {},
    this.actions = const {},
    this.onAction,
    this.onError,
    this.errorBuilder,
    this.onNodeBuilt,
    this.onLoad,
  }) : node = null;

  const SpaceWidget.node({
    super.key,
    required SpaceNode this.node,
    this.controller,
    this.services,
    this.widgets = const {},
    this.actions = const {},
    this.onAction,
    this.onError,
    this.errorBuilder,
    this.onNodeBuilt,
    this.onLoad,
  }) : data = null;

  @override
  State<SpaceWidget> createState() => _SpaceWidgetState();
}

class _SpaceWidgetState extends State<SpaceWidget> {
  late SpaceController _controller;
  late _SpaceRenderer _renderer;
  SpaceNode? _root;
  SpaceIssue? _parseIssue;

  @override
  void initState() {
    super.initState();
    _controller = widget.controller ?? SpaceController();
    _renderer = _SpaceRenderer(this);
    _parse();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _root != null && widget.onLoad != null) {
        unawaited(_renderer.dispatch(context, _root!, widget.onLoad));
      }
    });
  }

  void _parse() {
    _parseIssue = null;
    try {
      _root = widget.node ?? SpaceNode.fromJson(widget.data!);
    } on FormatException catch (error) {
      _root = null;
      _parseIssue = SpaceIssue(r'$', error.message.toString());
    }
  }

  @override
  void didUpdateWidget(covariant SpaceWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      if (oldWidget.controller == null) _controller.dispose();
      _controller = widget.controller ?? SpaceController();
    }
    if (oldWidget.data != widget.data || oldWidget.node != widget.node) {
      _parse();
    }
  }

  @override
  void dispose() {
    _renderer.dispose();
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) {
      _renderer.beginBuild();
      return _parseIssue != null
          ? _renderer.error(context, _parseIssue!)
          : _renderer.render(_root!, context);
    },
  );
}

class _SpaceRenderer {
  final _SpaceWidgetState owner;
  final Map<String, GlobalKey<FormState>> forms = {};
  final Map<String, Map<String, dynamic>> formValues = {};
  final Set<String> _reported = {};
  final Set<SpaceCancellationToken> _pending = {};
  void dispose() {
    for (final token in _pending) {
      token.cancel();
    }
    _pending.clear();
  }

  _SpaceRenderer(this.owner);
  SpaceController get controller => owner._controller;

  void beginBuild() => _reported.clear();

  void reportIssue(SpaceIssue issue) {
    if (_reported.add(issue.toString())) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (owner.mounted) owner.widget.onError?.call(issue);
      });
    }
  }

  Widget error(BuildContext context, SpaceIssue issue) {
    reportIssue(issue);
    return owner.widget.errorBuilder?.call(context, issue) ??
        Text(
          'SpaceWidget: ${issue.message}',
          style: const TextStyle(color: Colors.red),
        );
  }

  Widget render(
    SpaceNode node,
    BuildContext context, {
    String? formId,
    int depth = 0,
  }) {
    // AppBar exposes PreferredSizeWidget to its parent. All other nodes build
    // at their actual position so inherited themes and action contexts work.
    if (node.type == 'appBar' && owner.widget.widgets[node.type] == null) {
      final result = _renderNode(node, context, formId: formId, depth: depth);
      if (owner.widget.onNodeBuilt == null || result is! PreferredSizeWidget) {
        return result;
      }
      return PreferredSize(
        preferredSize: result.preferredSize,
        child: Builder(
          builder: (context) {
            owner.widget.onNodeBuilt?.call(node, context);
            return result;
          },
        ),
      );
    }
    final result = Builder(
      builder: (context) {
        owner.widget.onNodeBuilt?.call(node, context);
        return _renderNode(node, context, formId: formId, depth: depth);
      },
    );
    return node.id == null
        ? result
        : KeyedSubtree(key: ValueKey(node.id), child: result);
  }

  Widget renderJson(
    dynamic value,
    BuildContext context, {
    required String path,
    String? formId,
    int depth = 0,
  }) {
    try {
      if (value is! Map<String, dynamic>) {
        throw const FormatException('expected a widget object');
      }
      return render(
        SpaceNode.fromJson(value, path: path),
        context,
        formId: formId,
        depth: depth,
      );
    } catch (exception) {
      return error(context, SpaceIssue(path, exception.toString()));
    }
  }

  Widget _renderNode(
    SpaceNode node,
    BuildContext context, {
    String? formId,
    int depth = 0,
  }) {
    try {
      if (depth >= 64) {
        throw const FormatException('maximum render depth exceeded');
      }
      final custom = owner.widget.widgets[node.type];
      final result = custom != null
          ? custom(
              SpaceBuildContext(
                context: context,
                node: node,
                controller: controller,
                build: (child) =>
                    render(child, context, formId: formId, depth: depth + 1),
                saveFormValue: (name, value) {
                  if (formId != null) {
                    formValues.putIfAbsent(formId, () => {})[name] = value;
                  }
                },
                dispatch: (action) =>
                    dispatch(context, node, action, formId: formId),
              ),
            )
          : _NodeBuilder(this, node, context, formId, depth).build();
      return result;
    } catch (exception) {
      return error(context, SpaceIssue(node.path, exception.toString()));
    }
  }

  Future<void> dispatch(
    BuildContext context,
    SpaceNode node,
    dynamic raw, {
    String? formId,
    Map<String, dynamic> event = const {},
  }) async {
    await _dispatch(context, node, raw, formId: formId, event: event);
  }

  Future<bool> _dispatch(
    BuildContext context,
    SpaceNode node,
    dynamic raw, {
    String? formId,
    Map<String, dynamic> event = const {},
  }) async {
    if (raw == null) return true;
    try {
      if (raw is List) {
        for (final action in raw) {
          if (!context.mounted || !owner.mounted) return false;
          if (!await _dispatch(
            context,
            node,
            action,
            formId: formId,
            event: event,
          )) {
            return false;
          }
        }
        return true;
      }
      if (raw is String) {
        raw = <String, dynamic>{'type': 'callback', 'name': raw};
      }
      if (raw is! Map<String, dynamic>) {
        throw const FormatException('action must be an object, name, or list');
      }
      dynamic resolve(dynamic value, {bool actionRoot = false}) {
        if (value is Map<String, dynamic>) {
          return value.map(
            (k, v) => MapEntry(
              k,
              actionRoot &&
                      const [
                        'content',
                        'onSuccess',
                        'onFailure',
                        'onDismiss',
                        'then',
                        'else',
                      ].contains(k)
                  ? v
                  : resolve(v),
            ),
          );
        }
        if (value is List) return value.map(resolve).toList();
        if (value is String && value.contains('{{event.')) {
          final scope = SpaceController(
            initialState: {...controller.state, 'event': event},
            parent: controller.parent,
          );
          try {
            return scope.resolve(value);
          } finally {
            scope.dispose();
          }
        }
        return controller.resolve(value);
      }

      final action = Map<String, dynamic>.from(
        resolve(raw, actionRoot: true) as Map,
      );
      final type = action['type'] ?? 'callback';
      switch (type) {
        case 'if':
          final condition = action['condition'];
          if (condition != null && condition is! bool) {
            throw const FormatException(
              'Action condition must resolve to a boolean',
            );
          }
          return await _dispatch(
            context,
            node,
            condition == true ? action['then'] : action['else'],
            formId: formId,
            event: event,
          );
        case 'set':
          controller.setValue(_requiredString(action, 'path'), action['value']);
          return true;
        case 'toggle':
          final path = _requiredString(action, 'path');
          controller.setValue(path, controller.read(path) != true);
          return true;
        case 'navigate':
        case 'replace':
          if (action['source'] != null) {
            final services =
                owner.widget.services ??
                _RemoteScope.maybeOf(context)?.services;
            if (services == null) {
              throw StateError('API navigation requires SpaceServices');
            }
            final parent = _RemoteScope.maybeOf(context);
            final route = MaterialPageRoute<dynamic>(
              settings: RouteSettings(
                name: action['source'].toString(),
                arguments: action['arguments'],
              ),
              builder: (_) => SpaceRemoteScreen(
                source: _requiredString(action, 'source'),
                method: action['method']?.toString() ?? 'GET',
                query: Map<String, dynamic>.from(action['query'] as Map? ?? {}),
                data: Map<String, dynamic>.from(action['data'] as Map? ?? {}),
                arguments: action['arguments'],
                offlineFallback: action['offlineFallback'] == true,
                cacheTtl: Duration(
                  seconds: (action['cacheSeconds'] as num? ?? 0).toInt(),
                ),
                services: services,
                appController: controller.appController,
                widgets: owner.widget.widgets,
                actions: owner.widget.actions,
                onAction: owner.widget.onAction,
                onError: owner.widget.onError,
                errorBuilder: owner.widget.errorBuilder,
              ),
            );
            if (type == 'replace') {
              unawaited(Navigator.of(context).pushReplacement(route));
            } else {
              await Navigator.of(context).push(route);
              if (owner.mounted &&
                  context.mounted &&
                  action['refreshOnReturn'] == true) {
                if (parent != null) {
                  await parent.refresh();
                } else {
                  await context
                      .getInheritedWidgetOfExactType<SpaceRefreshScope>()
                      ?.onRefresh();
                }
              }
            }
            return true;
          }
          if (type == 'replace') {
            unawaited(
              Navigator.of(context).pushReplacementNamed(
                _requiredString(action, 'route'),
                arguments: action['arguments'],
              ),
            );
            return true;
          }
          await Navigator.of(context).pushNamed(
            _requiredString(action, 'route'),
            arguments: action['arguments'],
          );
          return true;
        case 'openDrawer':
          final scaffold = Scaffold.maybeOf(context);
          if (scaffold == null) throw StateError('No scaffold is available');
          if (action['end'] == true) {
            scaffold.openEndDrawer();
          } else {
            scaffold.openDrawer();
          }
          return true;
        case 'changeTab':
          final tabs = DefaultTabController.maybeOf(context);
          final index = action['index'];
          if (tabs == null ||
              index is! num ||
              index.toInt() != index ||
              index < 0 ||
              index >= tabs.length) {
            throw const FormatException(
              'changeTab requires a valid tab index inside a tab controller',
            );
          }
          tabs.animateTo(index.toInt());
          return true;
        case 'refresh':
          final screen = _RemoteScope.maybeOf(context);
          final host = context
              .dependOnInheritedWidgetOfExactType<SpaceRefreshScope>();
          if (screen != null) {
            await screen.refresh();
          } else if (host != null) {
            await host.onRefresh();
          } else {
            throw StateError('No screen refresh handler is available');
          }
          return true;
        case 'increment':
          final path = _requiredString(action, 'path');
          final value = controller.read(path, 0);
          if (value is! num || (action['by'] ?? 1) is! num) {
            throw const FormatException('increment requires numeric values');
          }
          controller.setValue(path, value + (action['by'] ?? 1));
          return true;
        case 'append':
          final path = _requiredString(action, 'path');
          final current = controller.read(path, const []);
          if (current is! List) {
            throw const FormatException('append requires a list');
          }
          controller.setValue(path, [...current, action['value']]);
          return true;
        case 'pop':
          if (Navigator.of(context).canPop()) {
            Navigator.of(context).pop(action['result']);
          }
          return true;
        case 'snackbar':
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text('${action['message'] ?? ''}')));
          return true;
        case 'dialog':
        case 'bottomSheet':
          final content = action['content'];
          if (content is! Map<String, dynamic>) {
            throw const FormatException(
              'action.content must be a widget object',
            );
          }
          final child = SpaceNode.fromJson(
            content,
            path: '${node.path}.action.content',
          );
          // Overlay forms are isolated, while state and service configuration are shared.
          Widget buildOverlay(BuildContext overlayContext) {
            final rendered = SpaceWidget.node(
              node: child,
              controller: controller,
              services:
                  owner.widget.services ??
                  _RemoteScope.maybeOf(context)?.services,
              widgets: owner.widget.widgets,
              actions: owner.widget.actions,
              onAction: owner.widget.onAction,
              onError: owner.widget.onError,
              errorBuilder: owner.widget.errorBuilder,
              onNodeBuilt: owner.widget.onNodeBuilt,
            );
            return type == 'dialog' &&
                    !const ['dialog', 'alertDialog'].contains(child.type)
                ? Dialog(child: rendered)
                : rendered;
          }

          final dynamic result;
          if (type == 'dialog') {
            result = await showDialog<dynamic>(
              context: context,
              barrierDismissible: action['dismissible'] != false,
              useRootNavigator: action['useRootNavigator'] != false,
              builder: buildOverlay,
            );
          } else {
            result = await showModalBottomSheet<dynamic>(
              context: context,
              useRootNavigator: action['useRootNavigator'] == true,
              isDismissible: action['dismissible'] != false,
              enableDrag: action['enableDrag'] != false,
              showDragHandle: action['showDragHandle'] != false,
              useSafeArea: true,
              isScrollControlled: true,
              builder: (overlayContext) => Padding(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.viewInsetsOf(overlayContext).bottom,
                ),
                child: buildOverlay(overlayContext),
              ),
            );
          }
          if (!owner.mounted || !context.mounted) return false;
          if (action['resultPath'] is String) {
            controller.setValue(action['resultPath'], result);
          }
          return await _dispatch(
            context,
            node,
            action['onDismiss'],
            formId: formId,
            event: {...event, 'result': result},
          );
      }
      if (!owner.mounted || !context.mounted) return false;
      Map<String, dynamic> values = const {};
      if (type == 'submit') {
        final id = action['form']?.toString() ?? formId;
        final form = forms[id]?.currentState;
        if (form == null) throw FormatException('form "$id" is not mounted');
        if (!form.validate()) return false;
        formValues[id!] = {};
        form.save();
        values = freezeJsonMap(formValues[id]!);
      }
      if (type == 'request' ||
          type == 'operation' ||
          (type == 'submit' &&
              (action['source'] != null || action['operation'] != null))) {
        final services =
            owner.widget.services ?? _RemoteScope.maybeOf(context)?.services;
        if (services == null) {
          throw StateError('Service actions require SpaceServices');
        }
        final cancellation = SpaceCancellationToken();
        _pending.add(cancellation);
        try {
          final result = await services.execute(
            SpaceRequest(
              source:
                  action['source']?.toString() ??
                  action['name']?.toString() ??
                  action['operation']?.toString() ??
                  '',
              method:
                  action['method']?.toString() ??
                  (type == 'submit' ? 'POST' : 'GET'),
              query: Map<String, dynamic>.from(action['query'] as Map? ?? {}),
              data: {
                ...Map<String, dynamic>.from(action['data'] as Map? ?? {}),
                ...values,
              },
              cancellation: cancellation,
            ),
            operation: type == 'operation'
                ? _requiredString(action, 'name')
                : type == 'submit'
                ? action['operation']?.toString()
                : null,
          );
          if (!owner.mounted || !context.mounted || cancellation.isCancelled) {
            return false;
          }
          if (action['resultPath'] != null) {
            controller.setValue(action['resultPath'].toString(), {
              ...result.data,
              if (result.message != null) 'message': result.message,
            });
          }
          if (!result.success) {
            if (!result.cancelled) {
              await _dispatch(
                context,
                node,
                action['onFailure'],
                formId: formId,
                event: event,
              );
            }
            return false;
          }
          if (result.state.isNotEmpty) controller.patch(result.state);
          if (result.widgets != null) {
            final document = SpaceDocument.fromJson({
              'success': true,
              'widgets': result.widgets,
            });
            if (const [
              'dialog',
              'bottomSheet',
            ].contains(action['presentation'])) {
              await _dispatch(context, node, {
                'type': action['presentation'],
                'content': result.widgets,
              }, formId: formId);
            } else {
              final screen = _RemoteScope.maybeOf(context);
              if (screen == null) {
                throw StateError(
                  'Replacing a screen requires SpaceRemoteScreen',
                );
              }
              screen.replace(document);
            }
          }
          if (context.mounted && owner.mounted) {
            if (!await _dispatch(
              context,
              node,
              result.actions,
              formId: formId,
            )) {
              return false;
            }
            if (!context.mounted || !owner.mounted) return false;
            return await _dispatch(
              context,
              node,
              action['onSuccess'],
              formId: formId,
              event: event,
            );
          }
          return true;
        } catch (error) {
          if (owner.mounted &&
              context.mounted &&
              (!cancellation.isCancelled || error is TimeoutException)) {
            if (action['resultPath'] is String) {
              controller.setValue(action['resultPath'], {
                'message': error is TimeoutException
                    ? 'Request timed out. Please try again.'
                    : 'Unable to complete the request. Please try again.',
              });
            }
            await _dispatch(
              context,
              node,
              action['onFailure'],
              formId: formId,
              event: event,
            );
          }
          rethrow;
        } finally {
          _pending.remove(cancellation);
        }
      }
      final name = action['name']?.toString() ?? type.toString();
      final handler = owner.widget.actions[name] ?? owner.widget.onAction;
      if (handler == null) {
        throw FormatException('no action handler registered for "$name"');
      }
      if (!context.mounted || !owner.mounted) return false;
      await handler(
        SpaceActionEvent(
          context: context,
          node: node,
          controller: controller,
          action: freezeJsonMap(action),
          values: values,
        ),
      );
      return true;
    } catch (exception) {
      if (owner.mounted) {
        final issue = SpaceIssue('${node.path}.action', exception.toString());
        if (owner.widget.onError != null) {
          owner.widget.onError!(issue);
        } else {
          FlutterError.reportError(
            FlutterErrorDetails(
              exception: exception,
              library: 'spacewidget',
              context: ErrorDescription(issue.path),
            ),
          );
        }
      }
      return false;
    }
  }
}

String _requiredString(Map<String, dynamic> value, String key) {
  final result = value[key];
  if (result is! String || result.isEmpty) {
    throw FormatException('$key must be a nonempty string');
  }
  return result;
}

class _NodeBuilder {
  final _SpaceRenderer renderer;
  final SpaceNode node;
  final BuildContext context;
  final String? formId;
  final int depth;
  late final _Props p = _Props(node.props, renderer.controller, context);
  _NodeBuilder(this.renderer, this.node, this.context, this.formId, this.depth);

  Widget render(SpaceNode child, {String? form}) =>
      renderer.render(child, context, formId: form ?? formId, depth: depth + 1);
  Widget get child =>
      node.child == null ? const SizedBox.shrink() : render(node.child!);
  List<Widget> get children => node.children.map(render).toList();

  Widget? slot(String name) {
    final value = p.raw(name);
    if (value == null) return null;
    if (value is String) {
      return Text(p.boolean('literal') ? value : p.string(name));
    }
    if (value is! Map<String, dynamic>) {
      throw FormatException('$name must be a widget object');
    }
    return render(SpaceNode.fromJson(value, path: '${node.path}.$name'));
  }

  List<Widget> slots(String name) {
    final value = p.raw(name);
    if (value == null) return [];
    if (value is! List) throw FormatException('$name must be a list');
    return [
      for (var i = 0; i < value.length; i++)
        if (value[i] is Map<String, dynamic>)
          render(SpaceNode.fromJson(value[i], path: '${node.path}.$name[$i]'))
        else
          throw FormatException('$name[$i] must be a widget object'),
    ];
  }

  Future<void> action(dynamic value, [BuildContext? actionContext]) =>
      renderer.dispatch(actionContext ?? context, node, value, formId: formId);

  Future<void> eventAction(
    dynamic value,
    Map<String, dynamic> event, [
    BuildContext? actionContext,
  ]) => renderer.dispatch(
    actionContext ?? context,
    node,
    value,
    formId: formId,
    event: event,
  );

  Widget build() => _buildWidget(this);
}

// Structural equality prevents logically unchanged JSON props from refetching.
bool _sameJson(dynamic a, dynamic b, [int depth = 0]) {
  if (identical(a, b)) return true;
  if (depth > 64) return false;
  if (a is Map && b is Map) {
    return a.length == b.length &&
        a.keys.every(
          (key) => b.containsKey(key) && _sameJson(a[key], b[key], depth + 1),
        );
  }
  if (a is List && b is List) {
    return a.length == b.length &&
        List.generate(
          a.length,
          (i) => i,
        ).every((i) => _sameJson(a[i], b[i], depth + 1));
  }
  return a == b;
}
