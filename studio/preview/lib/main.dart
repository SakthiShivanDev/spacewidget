import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';
import 'package:web/web.dart' as web;

void main() => runApp(const StudioPreview());

class StudioPreview extends StatefulWidget {
  const StudioPreview({super.key});
  @override
  State<StudioPreview> createState() => _StudioPreviewState();
}

class _StudioPreviewState extends State<StudioPreview>
    with WidgetsBindingObserver {
  Map<String, dynamic>? _document;
  SpaceController? _controller;
  late final SpaceClient _client;
  late final SpaceServices _services;
  late final JSFunction _listener;
  late final JSFunction _keyListener;
  void Function(FlutterErrorDetails)? _previousErrorHandler;
  late final void Function(FlutterErrorDetails) _errorHandler;
  final _navigator = GlobalKey<NavigatorState>();
  final _observations = <String, (SpaceNode, BuildContext)>{};
  final _requests = <String, Completer<Map<String, dynamic>>>{};
  Map<String, dynamic> _seed = {};
  bool _run = false;
  bool _geometryScheduled = false;
  int _revision = -1;
  int _epoch = 0;
  int _requestId = 0;
  String _scope = '';

  void _post(Map<String, dynamic> message) => web.window.parent?.postMessage(
    message.jsify(),
    web.window.location.origin.toJS,
  );

  void _issue(String message, [String path = r'$']) => _post({
    'type': 'spacewidget-preview-error',
    'revision': _revision,
    'message': message,
    'path': path,
  });

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _previousErrorHandler = FlutterError.onError;
    _errorHandler = (details) {
      _issue(details.exceptionAsString(), details.context?.toString() ?? r'$');
      FlutterError.presentError(details);
    };
    FlutterError.onError = _errorHandler;
    _keyListener = ((web.Event event) {
      final key = event as web.KeyboardEvent;
      final name = key.key.toLowerCase();
      final modifier = key.ctrlKey || key.metaKey;
      final save = modifier && name == 's';
      final edit =
          !_run &&
          ((modifier && ['z', 'y', 'd'].contains(name)) ||
              ['delete', 'backspace', 'escape'].contains(name));
      if (!save && !edit) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      _post({
        'type': 'spacewidget-preview-shortcut',
        'key': key.key,
        'ctrlKey': key.ctrlKey,
        'metaKey': key.metaKey,
        'shiftKey': key.shiftKey,
      });
    }).toJS;
    web.window.addEventListener('keydown', _keyListener, true.toJS);
    _client = SpaceClient(
      baseUrl: web.window.location.origin,
      apiKey: 'studio-preview',
      sessionStore: SpaceMemorySessionStore(),
    );
    _services = SpaceServices(
      transport: (request) async {
        // Reads unsaved or published preview screens through the authenticated parent.
        // Service writes never reach the app database from the authoring canvas.
        if (request.method.toUpperCase() != 'GET' ||
            !RegExp(r'^/runtime/screens/[a-z][a-z0-9_-]*$')
                .hasMatch(request.source)) {
          throw StateError(
            'This service action needs a connected app. Preview mode does not write application data.',
          );
        }
        final id = 'request_${++_requestId}';
        final pending = Completer<Map<String, dynamic>>();
        _requests[id] = pending;
        _post({
          'type': 'spacewidget-preview-request',
          'requestId': id,
          'source': request.source,
          'query': request.query,
          'revision': _revision,
        });
        try {
          return await pending.future.timeout(const Duration(seconds: 15));
        } finally {
          _requests.remove(id);
        }
      },
    );
    _listener = ((web.Event event) {
      final message = event as web.MessageEvent;
      if (message.origin != web.window.location.origin ||
          message.source != web.window.parent) {
        return;
      }
      try {
        final data = jsonDecode(jsonEncode(message.data.dartify()));
        if (data is! Map) return;
        switch (data['type']) {
          case 'spacewidget-preview-response':
            final pending = _requests[data['requestId']];
            if (pending != null && !pending.isCompleted) {
              if (data['error'] != null) {
                pending.completeError(StateError('${data['error']}'));
              } else {
                pending.complete(
                  Map<String, dynamic>.from(data['document'] as Map),
                );
              }
            }
          case 'spacewidget-preview-controls':
            setState(() => _run = data['mode'] == 'run');
            if (!_run) FocusManager.instance.primaryFocus?.unfocus();
            if (!_run) {
              _navigator.currentState?.popUntil((route) => route.isFirst);
            }
            _scheduleGeometry();
          case 'spacewidget-preview-scroll':
            if (_run) return;
            GestureBinding.instance.handlePointerEvent(
              PointerScrollEvent(
                position: Offset(
                  (data['x'] as num).toDouble(),
                  (data['y'] as num).toDouble(),
                ),
                scrollDelta: Offset(
                  (data['dx'] as num).toDouble(),
                  (data['dy'] as num).toDouble(),
                ),
                kind: PointerDeviceKind.mouse,
              ),
            );
            _scheduleGeometry();
          case 'spacewidget-preview':
            if (data['document'] is! Map || data['revision'] is! int) return;
            final revision = data['revision'] as int;
            if (revision < _revision) return;
            final document = Map<String, dynamic>.from(data['document'] as Map);
            if (document['widgets'] is! Map) return;
            final nextScope =
                '${document['screenId']}:${document['componentId'] ?? ''}:${(document['preview'] as Map?)?['source'] ?? 'draft'}:${(document['preview'] as Map?)?['dataMode'] ?? 'sample'}:${(document['preview'] as Map?)?['userId'] ?? ''}:${data['reset'] ?? 0}';
            final nextSeed = Map<String, dynamic>.from(
              document['state'] as Map? ?? {},
            );
            final previewUser = (document['preview'] as Map?)?['user'];
            _client.controller.setValue('auth', {
              'signedIn': previewUser is Map,
              'user': previewUser,
            });
            final previous = _controller;
            final reset = nextScope != _scope;
            if (reset) {
              _epoch++;
              _controller = SpaceController(
                initialState: nextSeed,
                parent: _client.controller,
              );
              _navigator.currentState?.popUntil((route) => route.isFirst);
            } else if (jsonEncode(nextSeed) != jsonEncode(_seed)) {
              final state = Map<String, dynamic>.from(_controller!.state);
              for (final key in _seed.keys) {
                if (!nextSeed.containsKey(key)) state.remove(key);
              }
              _controller!.reset({...state, ...nextSeed});
            }
            _observations.clear();
            setState(() {
              _scope = nextScope;
              _seed = nextSeed;
              _document = document;
              _revision = revision;
            });
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (reset) previous?.dispose();
              if (!mounted || revision != _revision) return;
              _post({
                'type': 'spacewidget-preview-rendered',
                'revision': revision,
                'screenId': document['screenId'],
              });
              _scheduleGeometry();
            });
        }
      } catch (error) {
        _issue('Invalid preview message: $error');
      }
    }).toJS;
    web.window.addEventListener('message', _listener);
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _post({'type': 'spacewidget-preview-ready', 'protocol': 2}),
    );
  }

  Future<void> _refreshCurrent() async {
    final revision = _revision;
    final screenId = _document?['screenId'];
    if (screenId == null) throw StateError('Choose a screen to refresh.');
    final result = await _services.send(
      SpaceRequest(source: '/runtime/screens/$screenId'),
    );
    if (!mounted || revision != _revision) return;
    final seed = Map<String, dynamic>.from(result['state'] as Map? ?? {});
    final state = Map<String, dynamic>.from(_controller!.state);
    for (final key in _seed.keys) {
      if (!seed.containsKey(key)) state.remove(key);
    }
    _controller!.reset({...state, ...seed});
    setState(() {
      _document = result;
      _seed = seed;
    });
    _scheduleGeometry();
  }

  void _observe(SpaceNode node, BuildContext context) {
    if (node.id != null) {
      _observations['${node.path}:${node.id}'] = (node, context);
    }
    _scheduleGeometry();
  }

  @override
  void didChangeMetrics() => _scheduleGeometry();

  void _scheduleGeometry() {
    if (_geometryScheduled || !mounted) return;
    _geometryScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _geometryScheduled = false;
      if (!mounted) return;
      final boxes = <Map<String, dynamic>>[];
      final viewport = Rect.fromLTWH(
        0,
        0,
        web.window.innerWidth.toDouble(),
        web.window.innerHeight.toDouble(),
      );
      _observations.removeWhere((_, record) => !record.$2.mounted);
      for (final record in _observations.values) {
        final render = record.$2.findRenderObject();
        if (render is! RenderBox || !render.attached || !render.hasSize) {
          continue;
        }
        final rect = MatrixUtils.transformRect(
          render.getTransformTo(null),
          Offset.zero & render.size,
        ).intersect(viewport);
        if (rect.isEmpty || !rect.left.isFinite || !rect.top.isFinite) continue;
        boxes.add({
          'id': record.$1.id,
          'path': record.$1.path,
          'widgetType': record.$1.type,
          'x': rect.left,
          'y': rect.top,
          'width': rect.width,
          'height': rect.height,
        });
      }
      _post({
        'type': 'spacewidget-preview-geometry',
        'revision': _revision,
        'nodes': boxes,
      });
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    web.window.removeEventListener('message', _listener);
    web.window.removeEventListener('keydown', _keyListener, true.toJS);
    if (FlutterError.onError == _errorHandler) {
      FlutterError.onError = _previousErrorHandler;
    }
    _controller?.dispose();
    _client.dispose();
    for (final pending in _requests.values) {
      if (!pending.isCompleted) {
        pending.completeError(StateError('Preview closed'));
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = _document?['theme'] as Map? ?? {};
    return SpaceThemeFonts(
      theme: theme,
      child: MaterialApp(
        navigatorKey: _navigator,
        debugShowCheckedModeBanner: false,
        scrollBehavior: const MaterialScrollBehavior().copyWith(
          dragDevices: PointerDeviceKind.values.toSet(),
        ),
        theme: buildSpaceTheme(theme),
        darkTheme: buildSpaceTheme(
          spaceDarkTheme(theme, _document?['darkTheme']),
          brightness: Brightness.dark,
        ),
        themeMode: spaceThemeMode(_document?['themeMode']),
        home: _document == null
            ? const Scaffold(
                body: Center(child: Text('Select a screen in Studio.')),
              )
            : NotificationListener<ScrollNotification>(
                onNotification: (_) {
                  _scheduleGeometry();
                  return false;
                },
                child: SpaceRefreshScope(
                  onRefresh: _refreshCurrent,
                  child: IgnorePointer(
                    ignoring: false,
                    child: SpaceWidget(
                      key: ValueKey(_epoch),
                      data: Map<String, dynamic>.from(
                        _document!['widgets'] as Map,
                      ),
                      controller: _controller,
                      services: _services,
                      widgets: {
                        ..._client.widgets,
                        'authGate': (space) {
                          final raw =
                              space.node.props[_client.controller.read(
                                        'auth.signedIn',
                                      ) ==
                                      true
                                  ? 'then'
                                  : 'else'] ??
                              space.node.child;
                          if (raw is SpaceNode) return space.build(raw);
                          if (raw is Map<String, dynamic>) {
                            return space.build(SpaceNode.fromJson(raw));
                          }
                          return const SizedBox.shrink();
                        },
                      },
                      onNodeBuilt: _observe,
                      onError: (issue) => _issue(issue.message, issue.path),
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
