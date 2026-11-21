import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:flutter/material.dart';

import 'controller.dart';
import 'node.dart';
import 'network.dart';

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

/// Context supplied to a registered custom widget builder.
class SpaceBuildContext {
  final BuildContext context;
  final SpaceNode node;
  final SpaceController controller;
  final Widget Function(SpaceNode node) build;
  final Future<void> Function(dynamic action) dispatch;
  final void Function(String name, dynamic value) saveFormValue;
  const SpaceBuildContext({
    required this.context,
    required this.node,
    required this.controller,
    required this.build,
    required this.dispatch,
    required this.saveFormValue,
  });
}

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

  Widget error(BuildContext context, SpaceIssue issue) {
    if (_reported.add(issue.toString())) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (owner.mounted) owner.widget.onError?.call(issue);
      });
    }
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
      return _renderNode(node, context, formId: formId, depth: depth);
    }
    final result = Builder(
      builder: (context) =>
          _renderNode(node, context, formId: formId, depth: depth),
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
  }) async {
    await _dispatch(context, node, raw, formId: formId);
  }

  Future<bool> _dispatch(
    BuildContext context,
    SpaceNode node,
    dynamic raw, {
    String? formId,
  }) async {
    if (raw == null) return true;
    try {
      if (raw is List) {
        for (final action in raw) {
          if (!context.mounted || !owner.mounted) return false;
          if (!await _dispatch(context, node, action, formId: formId)) {
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
      dynamic resolve(dynamic value) {
        if (value is Map<String, dynamic>) {
          return value.map(
            (k, v) => MapEntry(
              k,
              const ['content', 'onSuccess', 'onFailure'].contains(k)
                  ? v
                  : resolve(v),
            ),
          );
        }
        if (value is List) return value.map(resolve).toList();
        return controller.resolve(value);
      }

      final action = Map<String, dynamic>.from(resolve(raw) as Map);
      final type = action['type'] ?? 'callback';
      switch (type) {
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
                await parent?.refresh();
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
        case 'refresh':
          final screen = _RemoteScope.maybeOf(context);
          if (screen == null) throw StateError('No remote screen to refresh');
          await screen.refresh();
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
          // Each overlay owns its forms, independently of the underlying page.
          Widget buildOverlay(BuildContext overlayContext) => SpaceWidget.node(
            node: child,
            controller: controller,
            services: owner.widget.services,
            widgets: owner.widget.widgets,
            actions: owner.widget.actions,
            onAction: owner.widget.onAction,
            onError: owner.widget.onError,
            errorBuilder: owner.widget.errorBuilder,
          );
          if (type == 'dialog') {
            await showDialog<void>(context: context, builder: buildOverlay);
          } else {
            await showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              builder: buildOverlay,
            );
          }
          return true;
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
          (type == 'submit' && action['source'] != null)) {
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
                : null,
          );
          if (!owner.mounted || !context.mounted || cancellation.isCancelled) {
            return false;
          }
          if (action['resultPath'] != null) {
            controller.setValue(action['resultPath'].toString(), result.data);
          }
          if (!result.success) {
            if (!result.cancelled) {
              await _dispatch(
                context,
                node,
                action['onFailure'],
                formId: formId,
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
            if (action['presentation'] == 'dialog') {
              await _dispatch(context, node, {
                'type': 'dialog',
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
            );
          }
          return true;
        } catch (error) {
          if (owner.mounted &&
              context.mounted &&
              (!cancellation.isCancelled || error is TimeoutException)) {
            await _dispatch(context, node, action['onFailure'], formId: formId);
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
  late final _Props p = _Props(node.props, renderer.controller);
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
