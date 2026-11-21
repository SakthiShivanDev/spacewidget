import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:file_selector/file_selector.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:image_picker/image_picker.dart';
import 'package:latlong2/latlong.dart';
import 'package:pdfx/pdfx.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Native/browser integrations kept separate from the Flutter-only core.
/// File and launch functions are injectable so applications can test flows
/// without opening OS dialogs or contacting a payment provider.
class SpacePlatform {
  final Future<List<XFile>> Function() selectFiles;
  final Future<XFile?> Function() capturePhoto;
  final Future<bool> Function(Uri uri) launch;
  final int maxFileBytes;
  final String? tileUrl;
  final String attribution;
  final String userAgentPackageName;
  final Set<String>? allowedWebHosts;
  final bool allowInsecureLocalhost;
  final bool allowJavaScript;
  SpacePlatform({
    Future<List<XFile>> Function()? selectFiles,
    Future<XFile?> Function()? capturePhoto,
    Future<bool> Function(Uri)? launch,
    this.maxFileBytes = 20 * 1024 * 1024,
    this.tileUrl,
    this.attribution = '',
    this.userAgentPackageName = 'spacewidget.app',
    this.allowedWebHosts,
    this.allowInsecureLocalhost = false,
    this.allowJavaScript = false,
  }) : selectFiles = selectFiles ?? (() => openFiles()),
       capturePhoto =
           capturePhoto ??
           (() => ImagePicker().pickImage(source: ImageSource.camera)),
       launch =
           launch ??
           ((uri) => launchUrl(uri, mode: LaunchMode.externalApplication));

  Future<SpaceResult> _files(List<XFile> files) async {
    if (files.isEmpty) return SpaceResult(success: false, cancelled: true);
    final result = <Map<String, dynamic>>[];
    var total = 0;
    for (final file in files) {
      final length = await file.length();
      total += length;
      if (total > maxFileBytes) {
        throw StateError('Selected files exceed maxFileBytes');
      }
      final bytes = await file.readAsBytes();
      result.add({
        'name': file.name,
        'size': bytes.length,
        'mimeType': file.mimeType,
        'bytes': base64Encode(bytes),
      });
    }
    return SpaceResult(success: true, data: {'files': result});
  }

  Uri _webUri(dynamic value) {
    final uri = Uri.tryParse('$value');
    final local =
        uri != null &&
        allowInsecureLocalhost &&
        uri.scheme == 'http' &&
        const {'localhost', '127.0.0.1', '::1'}.contains(uri.host);
    if (uri == null || (uri.scheme != 'https' && !local) || uri.host.isEmpty) {
      throw const FormatException('An absolute HTTPS URL is required');
    }
    if (allowedWebHosts != null && !allowedWebHosts!.contains(uri.host)) {
      throw const FormatException('URL host is not allowed');
    }
    return uri;
  }

  Map<String, SpaceOperation> get operations => {
    'pickFiles': (_) async => _files(await selectFiles()),
    'capturePhoto': (_) async {
      final file = await capturePhoto();
      return _files(file == null ? [] : [file]);
    },
    'openUrl': (request) async {
      final opened = await launch(_webUri(request.data['url']));
      return SpaceResult(success: opened);
    },
    // Opening a hosted checkout only starts payment. Its return is deliberately
    // unsuccessful for action sequencing; only a backend verification request
    // may mark an order paid. The session ID is retained for that request.
    'checkout': (request) async {
      final opened = await launch(_webUri(request.data['url']));
      return SpaceResult(
        success: false,
        data: {
          'status': opened ? 'pending' : 'notOpened',
          'sessionId': request.data['sessionId'],
        },
        message: opened
            ? 'Awaiting payment confirmation'
            : 'Unable to open checkout',
      );
    },
  };

  Map<String, SpaceWidgetBuilder> get widgets => {
    'videoPlayer': (context) => SpaceVideoPlayer(space: context),
    'audioPlayer': (context) =>
        SpaceVideoPlayer(space: context, audioOnly: true),
    'map': (context) {
      final latitude = _number(context, 'latitude', 0),
          longitude = _number(context, 'longitude', 0);
      if (latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180) {
        throw const FormatException('Map coordinates are out of bounds');
      }
      return _SpaceMap(space: context, platform: this);
    },
    'documentViewer': (context) => SizedBox(
      height: _number(context, 'height', 500),
      child: _SpaceDocument(
        uri: _webUri(_value(context, 'src')),
        launch: launch,
      ),
    ),
    'webView': (context) => _SpaceWebView(
      space: context,
      validate: _webUri,
      launch: launch,
      allowJavaScript: allowJavaScript,
    ),
    'filePicker': (context) => _FileField(
      space: context,
      choose: () async => _files(await selectFiles()),
    ),
    'cameraInput': (context) => _FileField(
      space: context,
      choose: () async {
        final file = await capturePhoto();
        return _files(file == null ? [] : [file]);
      },
    ),
  };
}

dynamic _value(SpaceBuildContext space, String key, [dynamic fallback]) =>
    space.controller.resolve(space.node.props[key]) ?? fallback;
double _number(SpaceBuildContext space, String key, double fallback) {
  final value = _value(space, key, fallback);
  if (value is! num || !value.isFinite) {
    throw FormatException('$key must be a finite number');
  }
  return value.toDouble();
}

/// Network media with captions, resume position, seeking and deterministic
/// controller disposal. DRM/casting/download licensing use a custom builder.
class SpaceVideoPlayer extends StatefulWidget {
  final SpaceBuildContext space;
  final bool audioOnly;
  const SpaceVideoPlayer({
    super.key,
    required this.space,
    this.audioOnly = false,
  });
  @override
  State<SpaceVideoPlayer> createState() => _SpaceVideoPlayerState();
}

class _SpaceVideoPlayerState extends State<SpaceVideoPlayer> {
  VideoPlayerController? _player;
  String _source = '';
  String? _error;
  int _generation = 0, _lastSecond = -1;
  bool _completed = false, _initializing = true;
  @override
  void initState() {
    super.initState();
    unawaited(_initialize());
  }

  @override
  void didUpdateWidget(covariant SpaceVideoPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_source != _value(widget.space, 'src', '')) unawaited(_initialize());
  }

  Future<void> _initialize() async {
    final generation = ++_generation;
    _completed = false;
    _initializing = true;
    _lastSecond = -1;
    final old = _player;
    _player = null;
    old?.removeListener(_progress);
    if (old != null) unawaited(old.dispose());
    _source = '${_value(widget.space, 'src', '')}';
    _error = null;
    if (_source.isEmpty) {
      _error = 'Media source is required';
      return;
    }
    try {
      final uri = Uri.parse(_source);
      if (!const ['https', 'http'].contains(uri.scheme)) {
        throw const FormatException('HTTP media source required');
      }
      Future<ClosedCaptionFile>? captions;
      final captionUrl = _value(widget.space, 'captions');
      if (captionUrl != null) {
        captions = Dio()
            .get<String>(
              '$captionUrl',
              options: Options(responseType: ResponseType.plain),
            )
            .then((response) => WebVTTCaptionFile(response.data ?? ''));
      }
      final player = _player = VideoPlayerController.networkUrl(
        uri,
        closedCaptionFile: captions,
      );
      player.addListener(_progress);
      await player.initialize();
      if (!mounted || generation != _generation) return;
      final resume = widget.space.node.props['positionBind']?.toString();
      final seconds = resume == null
          ? 0
          : widget.space.controller.read(resume, 0);
      if (seconds is num && seconds > 0) {
        await player.seekTo(Duration(seconds: seconds.toInt()));
      }
      if (!mounted || generation != _generation) return;
      _initializing = false;
      _progress();
      await player.setLooping(_value(widget.space, 'loop', false) == true);
      if (_value(widget.space, 'autoplay', false) == true) await player.play();
      if (mounted && generation == _generation) setState(() {});
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = error.toString());
      }
    }
  }

  void _progress() {
    final player = _player;
    if (!mounted ||
        _initializing ||
        player == null ||
        !player.value.isInitialized) {
      return;
    }
    if (player.value.isCompleted && !_completed) {
      _completed = true;
      unawaited(widget.space.dispatch(widget.space.node.props['onComplete']));
    }
    final seconds = player.value.position.inSeconds;
    if (seconds == _lastSecond) return;
    _lastSecond = seconds;
    final bind = widget.space.node.props['positionBind']?.toString();
    if (bind != null) widget.space.controller.setValue(bind, seconds);
  }

  @override
  void dispose() {
    _generation++;
    _player?.removeListener(_progress);
    unawaited(_player?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final player = _player;
    if (_error != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Unable to play media'),
          TextButton(onPressed: _initialize, child: const Text('Retry')),
        ],
      );
    }
    if (player == null || !player.value.isInitialized) {
      return const SizedBox(
        height: 180,
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: player,
      builder: (context, value, _) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!widget.audioOnly)
            AspectRatio(
              aspectRatio: value.aspectRatio > 0 ? value.aspectRatio : 16 / 9,
              child: Stack(
                alignment: Alignment.bottomCenter,
                children: [
                  VideoPlayer(player),
                  ClosedCaption(text: value.caption.text),
                ],
              ),
            ),
          VideoProgressIndicator(player, allowScrubbing: true),
          Row(
            children: [
              IconButton(
                tooltip: value.isPlaying ? 'Pause' : 'Play',
                onPressed: () =>
                    value.isPlaying ? player.pause() : player.play(),
                icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
              ),
              Text(
                '${value.position.inMinutes}:${(value.position.inSeconds % 60).toString().padLeft(2, '0')}',
              ),
              const Spacer(),
              IconButton(
                tooltip: value.volume == 0 ? 'Unmute' : 'Mute',
                onPressed: () => player.setVolume(value.volume == 0 ? 1 : 0),
                icon: Icon(
                  value.volume == 0 ? Icons.volume_off : Icons.volume_up,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SpaceMap extends StatefulWidget {
  final SpaceBuildContext space;
  final SpacePlatform platform;
  const _SpaceMap({required this.space, required this.platform});
  @override
  State<_SpaceMap> createState() => _SpaceMapState();
}

class _SpaceMapState extends State<_SpaceMap> {
  final _controller = MapController();
  double? _lat, _lng;
  bool _ready = false;
  @override
  void didUpdateWidget(covariant _SpaceMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final lat = _number(widget.space, 'latitude', 0),
        lng = _number(widget.space, 'longitude', 0);
    if (_ready && (lat != _lat || lng != _lng)) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _controller.move(LatLng(lat, lng), _number(widget.space, 'zoom', 13));
        }
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final space = widget.space, platform = widget.platform;
    final tile = platform.tileUrl;
    if (tile == null || platform.attribution.isEmpty) {
      return const Center(
        child: Text('Configure map tiles and attribution in SpacePlatform'),
      );
    }
    _lat = _number(space, 'latitude', 0);
    _lng = _number(space, 'longitude', 0);
    final raw = _value(space, 'markers', const []);
    final markers = <Marker>[];
    if (raw is List) {
      for (final marker in raw) {
        if (marker is Map) {
          markers.add(
            Marker(
              point: LatLng(
                (space.controller.resolve(marker['latitude']) as num)
                    .toDouble(),
                (space.controller.resolve(marker['longitude']) as num)
                    .toDouble(),
              ),
              child: Tooltip(
                message: '${marker['label'] ?? ''}',
                child: const Icon(
                  Icons.location_on,
                  color: Colors.red,
                  size: 36,
                ),
              ),
            ),
          );
        }
      }
    }
    return SizedBox(
      height: _number(space, 'height', 300),
      child: FlutterMap(
        mapController: _controller,
        options: MapOptions(
          initialCenter: LatLng(_lat!, _lng!),
          initialZoom: _number(space, 'zoom', 13),
          onMapReady: () => _ready = true,
          onTap: (_, point) {
            final bind = space.node.props['bind']?.toString();
            if (bind != null) {
              space.controller.setValue(bind, {
                'latitude': point.latitude,
                'longitude': point.longitude,
              });
            }
          },
        ),
        children: [
          TileLayer(
            urlTemplate: tile,
            userAgentPackageName: platform.userAgentPackageName,
          ),
          MarkerLayer(markers: markers),
          RichAttributionWidget(
            attributions: [TextSourceAttribution(platform.attribution)],
          ),
        ],
      ),
    );
  }
}

class _SpaceWebView extends StatefulWidget {
  final SpaceBuildContext space;
  final Uri Function(dynamic) validate;
  final Future<bool> Function(Uri) launch;
  final bool allowJavaScript;
  const _SpaceWebView({
    required this.space,
    required this.validate,
    required this.launch,
    required this.allowJavaScript,
  });
  @override
  State<_SpaceWebView> createState() => _SpaceWebViewState();
}

class _SpaceWebViewState extends State<_SpaceWebView> {
  WebViewController? _controller;
  String _source = '';
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant _SpaceWebView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_source != _value(widget.space, 'src', '')) _load();
  }

  void _load() {
    _source = '${_value(widget.space, 'src', '')}';
    if (kIsWeb ||
        !const [
          TargetPlatform.android,
          TargetPlatform.iOS,
          TargetPlatform.macOS,
        ].contains(defaultTargetPlatform)) {
      return;
    }
    final controller = _controller ??= WebViewController()
      ..setJavaScriptMode(
        widget.allowJavaScript
            ? JavaScriptMode.unrestricted
            : JavaScriptMode.disabled,
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            try {
              widget.validate(request.url);
              return NavigationDecision.navigate;
            } catch (_) {
              return NavigationDecision.prevent;
            }
          },
        ),
      );
    unawaited(controller.loadRequest(widget.validate(_source)));
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null) {
      return TextButton(
        onPressed: () => widget.launch(widget.validate(_source)),
        child: const Text('Open document'),
      );
    }
    return SizedBox(
      height: _number(widget.space, 'height', 400),
      child: WebViewWidget(controller: _controller!),
    );
  }
}

class _FileField extends StatefulWidget {
  final SpaceBuildContext space;
  final Future<SpaceResult> Function() choose;
  const _FileField({required this.space, required this.choose});
  @override
  State<_FileField> createState() => _FileFieldState();
}

class _FileFieldState extends State<_FileField> {
  bool _busy = false;
  String? _error;
  String get _bind =>
      '${widget.space.node.props['bind'] ?? widget.space.node.props['name'] ?? 'files'}';
  @override
  Widget build(BuildContext context) {
    final files = widget.space.controller.read(_bind, const []) as List;
    return FormField<List<dynamic>>(
      initialValue: files,
      validator: (_) =>
          widget.space.node.props['required'] == true && files.isEmpty
          ? 'Select a file'
          : null,
      onSaved: (_) => widget.space.saveFormValue(
        '${widget.space.node.props['name'] ?? _bind}',
        files,
      ),
      builder: (field) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          OutlinedButton.icon(
            onPressed: _busy
                ? null
                : () async {
                    setState(() {
                      _busy = true;
                      _error = null;
                    });
                    try {
                      final result = await widget.choose();
                      if (!mounted || !result.success) return;
                      final selected = result.data['files'] as List;
                      widget.space.controller.setValue(_bind, selected);
                      field.didChange(selected);
                    } catch (_) {
                      if (mounted) {
                        setState(() => _error = 'Unable to select file');
                      }
                    } finally {
                      if (mounted) setState(() => _busy = false);
                    }
                  },
            icon: const Icon(Icons.attach_file),
            label: Text(
              _busy
                  ? 'Selecting…'
                  : '${widget.space.node.props['label'] ?? 'Select files'}',
            ),
          ),
          for (final file in files)
            ListTile(
              title: Text('${file['name']}'),
              trailing: IconButton(
                tooltip: 'Remove file',
                icon: const Icon(Icons.close),
                onPressed: () {
                  final next = List<dynamic>.from(files)..remove(file);
                  widget.space.controller.setValue(_bind, next);
                  field.didChange(next);
                },
              ),
            ),
          if (field.hasError || _error != null)
            Text(
              field.errorText ?? _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
        ],
      ),
    );
  }
}

class _SpaceDocument extends StatefulWidget {
  final Uri uri;
  final Future<bool> Function(Uri) launch;
  const _SpaceDocument({required this.uri, required this.launch});
  @override
  State<_SpaceDocument> createState() => _SpaceDocumentState();
}

class _SpaceDocumentState extends State<_SpaceDocument> {
  PdfController? _controller;
  final Dio _dio = Dio();
  CancelToken? _cancellation;
  bool get _supported =>
      kIsWeb || defaultTargetPlatform != TargetPlatform.linux;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    if (!_supported) return;
    _cancellation?.cancel();
    _controller?.dispose();
    final cancellation = _cancellation = CancelToken();
    _controller = PdfController(document: _download(widget.uri, cancellation));
  }

  Future<PdfDocument> _download(Uri uri, CancelToken cancellation) async {
    final response = await _dio.get<List<int>>(
      '$uri',
      options: Options(responseType: ResponseType.bytes),
      cancelToken: cancellation,
    );
    return PdfDocument.openData(Uint8List.fromList(response.data!));
  }

  @override
  void didUpdateWidget(covariant _SpaceDocument oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.uri != widget.uri) _load();
  }

  @override
  void dispose() {
    _cancellation?.cancel();
    _controller?.dispose();
    _dio.close(force: true);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _supported
      ? PdfView(controller: _controller!)
      : Center(
          child: TextButton(
            onPressed: () => widget.launch(widget.uri),
            child: const Text('Open PDF document'),
          ),
        );
}
