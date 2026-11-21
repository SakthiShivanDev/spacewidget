part of 'renderer.dart';

enum SpaceLoadStatus { loading, ready, refreshing, offline, failed }

/// Observe a remote screen and refresh it without reaching into its State.
class SpaceScreenController extends ChangeNotifier {
  SpaceLoadStatus _status = SpaceLoadStatus.loading;
  SpaceIssue? _error;
  Future<void> Function()? _refresh;
  SpaceLoadStatus get status => _status;
  SpaceIssue? get error => _error;
  Future<void> refresh() => _refresh?.call() ?? Future.value();
  void _update(SpaceLoadStatus status, [SpaceIssue? error]) {
    _status = status;
    _error = error;
    notifyListeners();
  }
}

/// Loads a complete screen from one endpoint. Rebuilding does not refetch.
/// Refresh/retry explicitly fetch again. A newer request supersedes an older
/// one, and disposal cooperatively cancels the transport request.
class SpaceRemoteScreen extends StatefulWidget {
  final String source;
  final String method;
  final Map<String, dynamic> query;
  final Map<String, dynamic> data;
  final dynamic arguments;
  final SpaceServices services;
  final SpaceController? appController;
  final SpaceScreenController? screenController;
  final Map<String, SpaceWidgetBuilder> widgets;
  final Map<String, SpaceActionHandler> actions;
  final SpaceActionHandler? onAction;
  final ValueChanged<SpaceIssue>? onError;
  final SpaceErrorBuilder? errorBuilder;
  final WidgetBuilder? loadingBuilder;
  final Duration cacheTtl;
  final bool offlineFallback;
  const SpaceRemoteScreen({
    super.key,
    required this.source,
    required this.services,
    this.method = 'GET',
    this.query = const {},
    this.data = const {},
    this.arguments,
    this.appController,
    this.screenController,
    this.widgets = const {},
    this.actions = const {},
    this.onAction,
    this.onError,
    this.errorBuilder,
    this.loadingBuilder,
    this.cacheTtl = Duration.zero,
    this.offlineFallback = false,
  });
  @override
  State<SpaceRemoteScreen> createState() => _SpaceRemoteScreenState();
}

class _SpaceRemoteScreenState extends State<SpaceRemoteScreen> {
  late SpaceController _local;
  late SpaceScreenController _handle;
  SpaceDocument? _document;
  SpaceIssue? _error;
  SpaceCancellationToken? _cancellation;
  int _generation = 0;
  bool _refreshing = false;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    _local = SpaceController(parent: widget.appController);
    _handle = widget.screenController ?? SpaceScreenController();
    _handle._refresh = () => _load(refresh: true);
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant SpaceRemoteScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.screenController != widget.screenController) {
      _handle._refresh = null;
      if (oldWidget.screenController == null) _handle.dispose();
      _handle = widget.screenController ?? SpaceScreenController();
      _handle._refresh = () => _load(refresh: true);
    }
    final changed =
        oldWidget.source != widget.source ||
        oldWidget.method != widget.method ||
        !_sameJson(oldWidget.query, widget.query) ||
        !_sameJson(oldWidget.data, widget.data) ||
        oldWidget.services != widget.services ||
        !_sameJson(oldWidget.arguments, widget.arguments) ||
        oldWidget.appController != widget.appController;
    if (changed) {
      _local.dispose();
      _local = SpaceController(parent: widget.appController);
      _document = null;
      unawaited(_load());
    }
  }

  String get _cacheKey => jsonEncode([
    widget.method.toUpperCase(),
    widget.source,
    widget.data,
    widget.arguments,
    (widget.query.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))
        .map((e) => [e.key, e.value])
        .toList(),
  ]);

  Future<void> _load({bool refresh = false}) async {
    final generation = ++_generation;
    _cancellation?.cancel();
    final cancellation = _cancellation = SpaceCancellationToken();
    _error = null;
    _refreshing = _document != null;
    _handle._update(
      _refreshing ? SpaceLoadStatus.refreshing : SpaceLoadStatus.loading,
    );
    if (mounted && refresh) setState(() {});
    try {
      final cacheable =
          widget.method.toUpperCase() == 'GET' &&
          widget.cacheTtl > Duration.zero;
      var document = !refresh && cacheable
          ? widget.services.cache?.read(_cacheKey, widget.cacheTtl)
          : null;
      final fetched = document == null;
      document ??= SpaceDocument.fromJson(
        await widget.services.send(
          SpaceRequest(
            source: widget.source,
            method: widget.method,
            query: widget.query,
            data: widget.data,
            arguments: widget.arguments,
            cancellation: cancellation,
          ),
        ),
      );
      if (!mounted || generation != _generation || cancellation.isCancelled) {
        return;
      }
      if (cacheable && fetched) {
        widget.services.cache?.write(_cacheKey, document);
      }
      _local.patch({
        ...document.state,
        'route': {'source': widget.source, 'arguments': widget.arguments},
      });
      setState(() {
        _document = document;
        _refreshing = false;
      });
      _offline = false;
      _handle._update(SpaceLoadStatus.ready);
      if (widget.offlineFallback &&
          widget.method.toUpperCase() == 'GET' &&
          widget.services.storage != null) {
        try {
          await widget.services.storage!.write(_cacheKey, document.json);
        } catch (error) {
          if (mounted) {
            widget.onError?.call(
              SpaceIssue(widget.source, 'Unable to cache screen: $error'),
            );
          }
        }
      }
    } catch (exception) {
      if (!mounted || generation != _generation) {
        return;
      }
      if (widget.offlineFallback &&
          widget.method.toUpperCase() == 'GET' &&
          widget.services.storage != null &&
          _document == null) {
        try {
          final cached = await widget.services.storage!.read(_cacheKey);
          if (!mounted ||
              generation != _generation ||
              cancellation.isCancelled) {
            return;
          }
          if (cached != null) {
            final document = SpaceDocument.fromJson(cached);
            _local.patch({
              ...document.state,
              'route': {'source': widget.source, 'arguments': widget.arguments},
            });
            setState(() {
              _document = document;
              _offline = true;
              _refreshing = false;
            });
            _handle._update(SpaceLoadStatus.offline);
            return;
          }
        } catch (_) {
          /* The original network error remains the actionable error. */
        }
      }
      final issue = SpaceIssue(widget.source, exception.toString());
      setState(() {
        _error = issue;
        _refreshing = false;
      });
      _handle._update(SpaceLoadStatus.failed, issue);
      widget.onError?.call(issue);
    }
  }

  void _replace(SpaceDocument document) {
    _local.patch(document.state);
    setState(() {
      _document = document;
      _error = null;
    });
  }

  @override
  void dispose() {
    _generation++;
    _cancellation?.cancel();
    _handle._refresh = null;
    if (widget.screenController == null) _handle.dispose();
    _local.dispose();
    super.dispose();
  }

  Widget _failure(BuildContext context) =>
      widget.errorBuilder?.call(context, _error!) ??
      Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined, size: 40),
              const SizedBox(height: 12),
              const Text('Unable to load this screen.'),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => _load(refresh: true),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final document = _document;
    Widget content;
    if (document == null) {
      content = Scaffold(
        body: _error == null
            ? widget.loadingBuilder?.call(context) ??
                  const Center(child: CircularProgressIndicator())
            : _failure(context),
      );
    } else {
      content = SpaceWidget.node(
        key: ValueKey('${widget.source}:${document.id ?? ''}'),
        node: document.root,
        controller: _local,
        services: widget.services,
        widgets: widget.widgets,
        actions: widget.actions,
        onAction: widget.onAction,
        onError: widget.onError,
        errorBuilder: widget.errorBuilder,
      );
      if (document.bodyOnly) content = Scaffold(body: content);
      if (_refreshing || _error != null || _offline) {
        content = Stack(
          children: [
            Positioned.fill(child: content),
            if (_refreshing)
              const Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(),
              ),
            if (_offline && _error == null)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Material(
                  child: SafeArea(
                    top: false,
                    child: ListTile(
                      title: const Text('Offline: showing a saved screen'),
                      trailing: TextButton(
                        onPressed: () => _load(refresh: true),
                        child: const Text('Reconnect'),
                      ),
                    ),
                  ),
                ),
              ),
            if (_error != null)
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Material(
                  child: SafeArea(
                    top: false,
                    child: ListTile(
                      title: const Text(
                        'Refresh failed. Your screen is preserved.',
                      ),
                      trailing: TextButton(
                        onPressed: () => _load(refresh: true),
                        child: const Text('Retry'),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      }
    }
    return _RemoteScope(
      services: widget.services,
      controller: _local,
      refresh: () => _load(refresh: true),
      replace: _replace,
      child: content,
    );
  }
}

class _RemoteScope extends InheritedWidget {
  final SpaceServices services;
  final SpaceController controller;
  final Future<void> Function() refresh;
  final void Function(SpaceDocument document) replace;
  const _RemoteScope({
    required this.services,
    required this.controller,
    required this.refresh,
    required this.replace,
    required super.child,
  });
  static _RemoteScope? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<_RemoteScope>();
  @override
  bool updateShouldNotify(_RemoteScope oldWidget) =>
      oldWidget.controller != controller || oldWidget.services != services;
}
