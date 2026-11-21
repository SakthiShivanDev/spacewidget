part of 'renderer.dart';

Widget _advancedWidget(_NodeBuilder b) {
  final p = b.p;
  switch (b.node.type) {
    case 'customScrollView':
      return CustomScrollView(
        slivers: b.children,
        shrinkWrap: p.boolean('shrinkWrap'),
      );
    case 'sliverAppBar':
      return SliverAppBar(
        title: Text(p.string('title')),
        pinned: p.boolean('pinned', true),
        floating: p.boolean('floating'),
        expandedHeight: p.number('expandedHeight'),
        flexibleSpace: b.slot('flexibleSpace'),
        actions: b.slots('actions'),
      );
    case 'sliverToBoxAdapter':
      return SliverToBoxAdapter(child: b.child);
    case 'sliverFillRemaining':
      return SliverFillRemaining(
        hasScrollBody: p.boolean('hasScrollBody'),
        child: b.child,
      );
    case 'sliverPadding':
      return SliverPadding(padding: p.insets('padding'), sliver: b.child);
    case 'sliverList':
      return SliverList.builder(
        itemCount: b.node.children.length,
        itemBuilder: (context, index) => b.renderer.render(
          b.node.children[index],
          context,
          formId: b.formId,
          depth: b.depth + 1,
        ),
      );
    case 'sliverGrid':
      return SliverGrid.builder(
        itemCount: b.node.children.length,
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: _positiveInt(p, 'crossAxisCount', 2),
          childAspectRatio: p.positive('childAspectRatio', 1, zero: false),
          crossAxisSpacing: p.positive('spacing', 8),
          mainAxisSpacing: p.positive('spacing', 8),
        ),
        itemBuilder: (context, index) => b.renderer.render(
          b.node.children[index],
          context,
          formId: b.formId,
          depth: b.depth + 1,
        ),
      );
    case 'stickyHeader':
      final min = p.positive('minHeight', 48),
          max = p.positive('maxHeight', 48);
      if (max < min) {
        throw const FormatException(
          'header maxHeight must be at least minHeight',
        );
      }
      return SliverPersistentHeader(
        pinned: p.boolean('pinned', true),
        delegate: _StickyHeader(min, max, b.child),
      );
    case 'nestedScrollView':
      return NestedScrollView(
        headerSliverBuilder: (_, _) => b.slots('headers'),
        body: b.child,
      );
    case 'draggableScrollableSheet':
      final min = _unit(p, 'minChildSize', .25),
          max = _unit(p, 'maxChildSize', .95),
          initial = _unit(p, 'initialChildSize', .5);
      if (min > initial || initial > max) {
        throw const FormatException(
          'sheet sizes must satisfy min <= initial <= max',
        );
      }
      return DraggableScrollableSheet(
        initialChildSize: initial,
        minChildSize: min,
        maxChildSize: max,
        expand: p.boolean('expand', false),
        builder: (_, scroll) => Material(
          borderRadius: BorderRadius.circular(p.positive('borderRadius', 16)),
          child: SingleChildScrollView(
            controller: scroll,
            padding: p.insets('padding', 16),
            child: b.child,
          ),
        ),
      );
    case 'imageGallery':
      final images = p.list('images');
      return SizedBox(
        height: p.positive('height', 280),
        child: PageView(
          children: [
            for (final image in images)
              InteractiveViewer(
                minScale: 1,
                maxScale: p.positive('maxScale', 4, zero: false),
                child: Center(
                  child: image is String
                      ? Image.network(
                          image,
                          errorBuilder: (_, _, _) =>
                              const Icon(Icons.broken_image_outlined),
                        )
                      : b.renderer.renderJson(
                          image,
                          b.context,
                          path: '${b.node.path}.images',
                          depth: b.depth + 1,
                        ),
                ),
              ),
          ],
        ),
      );
    case 'quantitySelector':
      return _QuantitySelector(builder: b);
    case 'timeline':
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final entry in p.list('items'))
            if (entry is Map)
              ListTile(
                leading: Icon(
                  entry['complete'] == true
                      ? Icons.check_circle
                      : Icons.radio_button_unchecked,
                ),
                title: Text('${entry['title'] ?? ''}'),
                subtitle: entry['subtitle'] == null
                    ? null
                    : Text('${entry['subtitle']}'),
              )
            else
              throw const FormatException('timeline entries must be objects'),
        ],
      );
    case 'countdown':
      return _Countdown(builder: b);
    case 'chart':
      final values = p.list('values');
      if (values.any((value) => value is! num || !value.isFinite)) {
        throw const FormatException('chart values must be finite numbers');
      }
      return Semantics(
        label: p.string('semanticLabel', 'Chart: ${values.join(', ')}'),
        child: SizedBox(
          height: p.positive('height', 180),
          width: p.number('width', double.infinity),
          child: CustomPaint(
            painter: _ChartPainter(
              values.cast<num>().map((v) => v.toDouble()).toList(),
              p.color('color', Theme.of(b.context).colorScheme.primary)!,
              p.string('kind', 'bar'),
            ),
          ),
        ),
      );
    case 'paginatedList':
    case 'dataView':
      return _RemoteData(builder: b);
    case 'live':
      return _LiveData(builder: b);
    case 'emptyState':
    case 'errorState':
      return Center(
        child: Padding(
          padding: p.insets('padding', 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                b.node.type == 'errorState'
                    ? Icons.error_outline
                    : Icons.inbox_outlined,
                size: 40,
              ),
              const SizedBox(height: 12),
              Text(
                p.string(
                  'text',
                  b.node.type == 'errorState'
                      ? 'Something went wrong'
                      : 'Nothing here yet',
                ),
              ),
              if (p.raw('action') != null)
                TextButton(
                  onPressed: () => b.action(p.raw('action')),
                  child: Text(p.string('actionLabel', 'Retry')),
                ),
            ],
          ),
        ),
      );
    case 'skeleton':
      return ExcludeSemantics(
        child: Container(
          width: p.number('width', double.infinity),
          height: p.positive('height', 24),
          decoration: BoxDecoration(
            color: Theme.of(b.context).colorScheme.surfaceContainerHighest,
            borderRadius: p.radius,
          ),
        ),
      );
    default:
      throw FormatException(
        'unknown widget type "${b.node.type}"; register a custom builder',
      );
  }
}

class _StickyHeader extends SliverPersistentHeaderDelegate {
  final double min, max;
  final Widget child;
  _StickyHeader(this.min, this.max, this.child);
  @override
  double get minExtent => min;
  @override
  double get maxExtent => max;
  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) => SizedBox.expand(child: child);
  @override
  bool shouldRebuild(covariant _StickyHeader oldDelegate) =>
      oldDelegate.min != min ||
      oldDelegate.max != max ||
      oldDelegate.child != child;
}

class _QuantitySelector extends StatelessWidget {
  final _NodeBuilder builder;
  const _QuantitySelector({required this.builder});
  @override
  Widget build(BuildContext context) {
    final b = builder, p = builder.p;
    final path = p.string('bind', p.string('name'));
    if (path.isEmpty) {
      throw const FormatException('quantitySelector requires bind or name');
    }
    final value = b.renderer.controller.read(
      path,
      p.integer('initialValue', 1),
    );
    final min = p.integer('min', 0), max = p.integer('max', 999);
    if (value is! int || max < min) {
      throw const FormatException(
        'quantitySelector requires integer bounds and value',
      );
    }
    void change(int next) {
      b.renderer.controller.setValue(path, next);
      unawaited(b.action(p.raw('onChanged')));
    }

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          tooltip: 'Decrease quantity',
          onPressed: value <= min ? null : () => change(value - 1),
          icon: const Icon(Icons.remove),
        ),
        Semantics(
          liveRegion: true,
          label: 'Quantity $value',
          child: Text('$value'),
        ),
        IconButton(
          tooltip: 'Increase quantity',
          onPressed: value >= max ? null : () => change(value + 1),
          icon: const Icon(Icons.add),
        ),
      ],
    );
  }
}

class _Countdown extends StatefulWidget {
  final _NodeBuilder builder;
  const _Countdown({required this.builder});
  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _timer;
  DateTime? _end;
  int _seconds = 0;
  bool _finished = false;
  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(covariant _Countdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.builder.p.string('endsAt') != _end?.toIso8601String() &&
        widget.builder.p.raw('endsAt') != oldWidget.builder.p.raw('endsAt')) {
      _start();
    }
  }

  void _start() {
    _timer?.cancel();
    _finished = false;
    _end = DateTime.tryParse(widget.builder.p.string('endsAt'));
    if (_end == null) return;
    _seconds = (_end!.difference(DateTime.now()).inMilliseconds / 1000)
        .ceil()
        .clamp(0, 1 << 31);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    if (!mounted || _end == null) return;
    final seconds = (_end!.difference(DateTime.now()).inMilliseconds / 1000)
        .ceil()
        .clamp(0, 1 << 31);
    setState(() => _seconds = seconds);
    if (_seconds == 0 && !_finished) {
      _finished = true;
      _timer?.cancel();
      unawaited(widget.builder.action(widget.builder.p.raw('onComplete')));
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _end == null
      ? widget.builder.renderer.error(
          context,
          SpaceIssue(widget.builder.node.path, 'countdown requires ISO endsAt'),
        )
      : Semantics(
          label: '$_seconds seconds remaining',
          child: Text(
            '${(_seconds ~/ 60).toString().padLeft(2, '0')}:${(_seconds % 60).toString().padLeft(2, '0')}',
          ),
        );
}

class _ChartPainter extends CustomPainter {
  final List<double> values;
  final Color color;
  final String kind;
  _ChartPainter(this.values, this.color, this.kind);
  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty || size.isEmpty) return;
    final max = values
        .map((v) => v.abs())
        .fold<double>(1, (a, b) => a > b ? a : b);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2;
    if (kind == 'line') {
      final path = Path();
      for (var i = 0; i < values.length; i++) {
        final x = values.length == 1
            ? size.width / 2
            : size.width * i / (values.length - 1);
        final y = size.height - (values[i].clamp(0, max) / max * size.height);
        i == 0 ? path.moveTo(x, y) : path.lineTo(x, y);
      }
      canvas.drawPath(path, paint..style = PaintingStyle.stroke);
    } else {
      final step = size.width / values.length;
      for (var i = 0; i < values.length; i++) {
        final height = values[i].clamp(0, max) / max * size.height;
        canvas.drawRect(
          Rect.fromLTWH(
            i * step + step * .1,
            size.height - height,
            step * .8,
            height,
          ),
          paint,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ChartPainter oldDelegate) =>
      !listEquals(values, oldDelegate.values) ||
      color != oldDelegate.color ||
      kind != oldDelegate.kind;
}

class _RemoteData extends StatefulWidget {
  final _NodeBuilder builder;
  const _RemoteData({required this.builder});
  @override
  State<_RemoteData> createState() => _RemoteDataState();
}

class _RemoteDataState extends State<_RemoteData> {
  _NodeBuilder get b => widget.builder;
  final _items = <dynamic>[];
  dynamic _data;
  dynamic _cursor;
  String? _error;
  bool _busy = false, _hasMore = true;
  int _generation = 0;
  String _fingerprint = '';
  String _seed = '';
  SpaceCancellationToken? _token;
  SpaceServices? get services =>
      b.renderer.owner.widget.services ??
      _RemoteScope.maybeOf(context)?.services;
  String get fingerprint => jsonEncode([
    b.p.string('source'),
    _query,
    identityHashCode(services),
    identityHashCode(b.renderer.controller),
  ]);
  Map<String, dynamic> get _query {
    final value = b.p.get('query', const <String, dynamic>{});
    if (value is! Map<String, dynamic>) {
      throw const FormatException('query must be an object');
    }
    return value.map(
      (key, value) => MapEntry(key, b.renderer.controller.resolve(value)),
    );
  }

  @override
  void initState() {
    super.initState();
    if (b.p.raw('initialItems') != null || b.p.raw('initialData') != null) {
      _seedFromScreen();
    } else {
      unawaited(_load(reset: true));
    }
  }

  void _seedFromScreen() {
    _generation++;
    _token?.cancel();
    _items
      ..clear()
      ..addAll(b.p.list('initialItems'));
    _data = b.p.get('initialData');
    _cursor = b.p.get('nextCursor');
    _hasMore = _cursor != null;
    _busy = false;
    _error = null;
    _seed = jsonEncode([
      b.p.get('initialItems'),
      b.p.get('initialData'),
      _cursor,
    ]);
    _fingerprint = fingerprint;
  }

  @override
  void didUpdateWidget(covariant _RemoteData oldWidget) {
    super.didUpdateWidget(oldWidget);
    try {
      if (_fingerprint != fingerprint) {
        unawaited(_load(reset: true));
      } else if ((b.p.raw('initialItems') != null ||
              b.p.raw('initialData') != null) &&
          _seed !=
              jsonEncode([
                b.p.get('initialItems'),
                b.p.get('initialData'),
                b.p.get('nextCursor'),
              ])) {
        _seedFromScreen();
      }
    } catch (error) {
      _error = error.toString();
    }
  }

  Future<void> _load({bool reset = false}) async {
    if (_busy && !reset) return;
    final generation = reset ? ++_generation : _generation;
    if (reset) {
      _token?.cancel();
      _items.clear();
      _cursor = null;
      _hasMore = true;
    }
    _busy = true;
    _error = null;
    if (mounted) setState(() {});
    final token = _token = SpaceCancellationToken();
    try {
      _fingerprint = fingerprint;
      final api = services;
      if (api == null) throw StateError('Data widgets require SpaceServices');
      final raw = await api.send(
        SpaceRequest(
          source: b.p.string('source'),
          query: {..._query, if (_cursor != null) 'cursor': _cursor},
          cancellation: token,
        ),
      );
      if (!mounted || token.isCancelled || generation != _generation) return;
      if (raw['success'] != true) {
        throw SpaceRemoteException('${raw['message'] ?? 'Request failed'}');
      }
      final data = raw['data'];
      if (b.node.type == 'paginatedList') {
        final values = data is Map ? data['items'] : data;
        if (values is! List) {
          throw const FormatException('paginated data must contain items');
        }
        final next = data is Map ? data['nextCursor'] : null;
        if (next != null && next == _cursor) {
          throw const FormatException('pagination cursor did not advance');
        }
        _items.addAll(values);
        _cursor = next;
        _hasMore = next != null;
      }
      setState(() {
        _data = data;
        _busy = false;
      });
    } catch (error) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _busy = false;
        _error = error.toString();
      });
      b.renderer.owner.widget.onError?.call(
        SpaceIssue(b.node.path, error.toString()),
      );
    }
  }

  @override
  void dispose() {
    _generation++;
    _token?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final template = b.p.raw('template');
    if (template is! Map<String, dynamic>) {
      return b.renderer.error(
        context,
        SpaceIssue(b.node.path, 'template must be a widget object'),
      );
    }
    Widget retry() => ListTile(
      title: const Text('Unable to load data'),
      trailing: TextButton(
        onPressed: () => _load(reset: _items.isEmpty),
        child: const Text('Retry'),
      ),
    );
    if (b.node.type == 'dataView') {
      if (_busy && _data == null) {
        return const Center(child: CircularProgressIndicator());
      }
      if (_error != null) return retry();
      return b.renderer.renderJson(
        _expandScoped(template, {'data': _data}),
        context,
        path: '${b.node.path}.template',
        formId: b.formId,
        depth: b.depth + 1,
      );
    }
    final shrink = b.p.boolean('shrinkWrap');
    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification.metrics.extentAfter < 200 &&
            !_busy &&
            _hasMore &&
            _error == null) {
          unawaited(_load());
        }
        return false;
      },
      child: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView.builder(
          shrinkWrap: shrink,
          primary: false,
          physics: const AlwaysScrollableScrollPhysics(),
          itemCount: _items.length + 1,
          itemBuilder: (context, index) {
            if (index == _items.length) {
              if (_error != null) return retry();
              if (_busy) {
                return const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (_hasMore) {
                return TextButton(
                  onPressed: () => _load(),
                  child: const Text('Load more'),
                );
              }
              return _items.isEmpty
                  ? b.slot('empty') ?? const Center(child: Text('No results'))
                  : const SizedBox.shrink();
            }
            return b.renderer.renderJson(
              _expandTemplate(template, _items[index], index),
              context,
              path: '${b.node.path}.items[$index]',
              formId: b.formId,
              depth: b.depth + 1,
            );
          },
        ),
      ),
    );
  }
}

dynamic _expandScoped(dynamic value, Map<String, dynamic> scope) {
  if (value is Map<String, dynamic>) {
    return value.map((k, v) => MapEntry(k, _expandScoped(v, scope)));
  }
  if (value is List) return value.map((v) => _expandScoped(v, scope)).toList();
  if (value is! String) return value;
  final regex = RegExp(r'\{\{\s*([^{}]+?)\s*\}\}');
  dynamic read(String path) {
    final parts = path.split('.');
    dynamic result = scope[parts.first];
    for (final key in parts.skip(1)) {
      result = result is Map ? result[key] : null;
    }
    return result;
  }

  final exact = regex.firstMatch(value);
  if (exact != null &&
      scope.containsKey(exact.group(1)!.trim().split('.').first) &&
      exact.start == 0 &&
      exact.end == value.length) {
    return read(exact.group(1)!.trim());
  }
  return value.replaceAllMapped(regex, (match) {
    final path = match.group(1)!.trim();
    return scope.containsKey(path.split('.').first)
        ? '${read(path) ?? ''}'
        : match.group(0)!;
  });
}

class _LiveData extends StatefulWidget {
  final _NodeBuilder builder;
  const _LiveData({required this.builder});
  @override
  State<_LiveData> createState() => _LiveDataState();
}

class _LiveDataState extends State<_LiveData> {
  StreamSubscription<Map<String, dynamic>>? _subscription;
  String? _error;
  String _fingerprint = '';
  bool _received = false;
  int _generation = 0;
  _NodeBuilder get b => widget.builder;
  @override
  void initState() {
    super.initState();
    _subscribe();
  }

  @override
  void didUpdateWidget(covariant _LiveData oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_fingerprint !=
        jsonEncode([
          b.p.string('stream'),
          b.p.string('source'),
          b.p.get('query'),
          identityHashCode(b.renderer.owner.widget.services),
          identityHashCode(b.renderer.controller),
        ])) {
      _subscribe();
    }
  }

  void _subscribe() {
    final generation = ++_generation;
    unawaited(_subscription?.cancel());
    _error = null;
    _received = false;
    _fingerprint = jsonEncode([
      b.p.string('stream'),
      b.p.string('source'),
      b.p.get('query'),
      identityHashCode(b.renderer.owner.widget.services),
      identityHashCode(b.renderer.controller),
    ]);
    try {
      final services =
          b.renderer.owner.widget.services ??
          _RemoteScope.maybeOf(context)?.services;
      final factory = services?.streams[b.p.string('stream')];
      if (factory == null) {
        throw StateError('No stream registered for "${b.p.string('stream')}"');
      }
      _subscription =
          factory(
            SpaceRequest(
              source: b.p.string('source'),
              query: Map<String, dynamic>.from(
                b.p.get('query', const <String, dynamic>{}) as Map,
              ),
            ),
          ).listen(
            (update) {
              if (!mounted || generation != _generation) return;
              b.renderer.controller.setValue(
                b.p.string('bind', 'live'),
                update,
              );
              setState(() => _received = true);
            },
            onError: (Object error, StackTrace stack) {
              if (!mounted || generation != _generation) return;
              setState(() => _error = error.toString());
              b.renderer.owner.widget.onError?.call(
                SpaceIssue(b.node.path, error.toString()),
              );
            },
          );
    } catch (error) {
      _error = error.toString();
    }
  }

  @override
  void dispose() {
    _generation++;
    unawaited(_subscription?.cancel());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Live updates disconnected'),
          TextButton(
            onPressed: () {
              setState(_subscribe);
            },
            child: const Text('Reconnect'),
          ),
        ],
      );
    }
    if (!_received && b.p.raw('loading') != null) return b.slot('loading')!;
    return b.child;
  }
}

class _InteractiveTable extends StatefulWidget {
  final _NodeBuilder builder;
  const _InteractiveTable({required this.builder});
  @override
  State<_InteractiveTable> createState() => _InteractiveTableState();
}

class _InteractiveTableState extends State<_InteractiveTable> {
  int? _sortColumn;
  bool _ascending = true;
  int _page = 0;
  final Set<dynamic> _selected = {};
  @override
  Widget build(BuildContext context) {
    final b = widget.builder, p = widget.builder.p;
    try {
      final columns = p.list('columns');
      if (columns.isEmpty) {
        throw const FormatException('dataTable requires columns');
      }
      final labels = columns
          .map((c) => c is Map ? '${c['label'] ?? c['key']}' : '$c')
          .toList();
      final keys = columns
          .asMap()
          .entries
          .map(
            (e) =>
                e.value is Map ? '${e.value['key'] ?? e.key}' : labels[e.key],
          )
          .toList();
      final input = p.list('rows');
      final rows = input.asMap().entries.map((entry) {
        final row = entry.value;
        final List<dynamic> values;
        final dynamic id;
        if (row is Map) {
          values = keys.map((key) => row[key]).toList();
          id = row[p.string('rowKey', 'id')] ?? entry.key;
        } else if (row is List && row.length == columns.length) {
          values = row;
          id = entry.key;
        } else {
          throw const FormatException(
            'table rows must be objects or lists matching columns',
          );
        }
        return (id, values);
      }).toList();
      if (_sortColumn != null && _sortColumn! < columns.length) {
        rows.sort((a, b) {
          final av = a.$2[_sortColumn!], bv = b.$2[_sortColumn!];
          final order = av is num && bv is num
              ? av.compareTo(bv)
              : '$av'.compareTo('$bv');
          return _ascending ? order : -order;
        });
      }
      final size = _positiveInt(p, 'pageSize', rows.isEmpty ? 10 : rows.length);
      final pageCount = (rows.length / size).ceil().clamp(1, 1 << 30);
      if (_page >= pageCount) _page = pageCount - 1;
      void selectionChanged() {
        if (p.raw('bind') != null) {
          b.renderer.controller.setValue(p.string('bind'), _selected.toList());
        }
        unawaited(b.action(p.raw('onSelectionChanged')));
      }

      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              sortColumnIndex: _sortColumn,
              sortAscending: _ascending,
              columns: [
                for (var i = 0; i < columns.length; i++)
                  DataColumn(
                    label: Text(labels[i]),
                    numeric: columns[i] is Map && columns[i]['numeric'] == true,
                    onSort: !p.boolean('sortable', true)
                        ? null
                        : (index, ascending) => setState(() {
                            _sortColumn = index;
                            _ascending = ascending;
                          }),
                  ),
              ],
              rows: [
                for (final row in rows.skip(_page * size).take(size))
                  DataRow(
                    key: ValueKey(row.$1),
                    selected: _selected.contains(row.$1),
                    onSelectChanged: !p.boolean('selectable')
                        ? null
                        : (selected) {
                            setState(() {
                              selected == true
                                  ? _selected.add(row.$1)
                                  : _selected.remove(row.$1);
                            });
                            selectionChanged();
                          },
                    cells: [
                      for (final value in row.$2)
                        DataCell(Text('${value ?? ''}')),
                    ],
                  ),
              ],
            ),
          ),
          if (pageCount > 1)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: _page == 0 ? null : () => setState(() => _page--),
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('${_page + 1} / $pageCount'),
                IconButton(
                  tooltip: 'Next page',
                  onPressed: _page >= pageCount - 1
                      ? null
                      : () => setState(() => _page++),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
        ],
      );
    } catch (error) {
      return b.renderer.error(
        context,
        SpaceIssue(b.node.path, error.toString()),
      );
    }
  }
}
