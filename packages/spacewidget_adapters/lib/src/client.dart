import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:spacewidget/spacewidget.dart';

import 'platform.dart';
import 'return_links.dart';
import 'transport.dart';
import 'auth_widgets.dart';
import 'hosted_http.dart'
    if (dart.library.js_interop) 'hosted_http_web.dart'
    as hosted_http;

abstract interface class SpaceSessionStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// Platform secure storage. Browser deployments require a secure context.
class SpaceSecureSessionStore implements SpaceSessionStore {
  final FlutterSecureStorage storage;
  const SpaceSecureSessionStore({this.storage = const FlutterSecureStorage()});
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => storage.delete(key: key);
}

/// Explicit non-persistent storage for previews, tests and temporary sessions.
class SpaceMemorySessionStore implements SpaceSessionStore {
  final Map<String, String> _values = {};
  @override
  Future<String?> read(String key) async => _values[key];
  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _values.remove(key);
  }
}

/// Connection to a separately hosted SpaceWidget Studio runtime.
/// The app key is publishable; user access/refresh tokens stay out of UI state.
class SpaceClient extends ChangeNotifier {
  final String baseUrl;
  final String apiKey;
  final SpaceSessionStore sessionStore;
  final SpaceController controller = SpaceController(
    initialState: {
      'auth': {'signedIn': false, 'user': null},
    },
  );
  final SpaceDocumentStorage? documentStorage;
  late final Dio _dio;
  late final SpaceDioTransport _transport;
  late final SpaceServices services;
  final SpacePlatform platform;
  final Map<String, SpaceWidgetBuilder> _customWidgets;
  final Uri? oauthReturnUri, paymentReturnUri;
  final List<Map<String, dynamic>> _queuedDestinations = [];
  late final StreamController<Map<String, dynamic>> _destinations =
      StreamController.broadcast(
        onListen: () {
          scheduleMicrotask(() {
            if (_disposed) return;
            for (final destination in _queuedDestinations) {
              _destinations.add(destination);
            }
            _queuedDestinations.clear();
          });
        },
      );
  void _emitDestination(Map<String, dynamic> destination) {
    if (_disposed) return;
    if (_destinations.hasListener) {
      _destinations.add(destination);
    } else {
      if (_queuedDestinations.length >= 4) _queuedDestinations.removeAt(0);
      _queuedDestinations.add(destination);
    }
  }

  String get integrationNamespace => '$_storageKey.integrations';
  Stream<Map<String, dynamic>> get destinations => _destinations.stream;
  Future<void> _linkPending = Future.value();
  String? _pushToken;
  final bool _ownsDio;
  Future<void>? _initialization;
  Future<void>? _refreshing;
  Future<void> _storagePending = Future.value();
  Map<String, dynamic>? _session;
  int _sessionEpoch = 0, _generation = 0;
  bool _disposed = false;
  Map<String, dynamic> _theme = const {'seedColor': '#7763E8'};
  Map<String, dynamic>? _darkTheme;
  String _themeMode = 'light';
  Map<String, dynamic>? get darkTheme => _darkTheme;
  String get themeMode => _themeMode;
  String _title = 'SpaceWidget';
  Map<String, dynamic> get theme => _theme;
  String get title => _title;

  SpaceClient({
    required this.baseUrl,
    required this.apiKey,
    SpaceSessionStore? sessionStore,
    this.documentStorage,
    this.oauthReturnUri,
    this.paymentReturnUri,
    SpacePlatform? platform,
    Dio? dio,
    Map<String, SpaceOperation> operations = const {},
    Map<String, SpaceWidgetBuilder> widgets = const {},
    Map<String, SpaceStreamFactory> streams = const {},
    bool allowInsecureHttp = false,
  }) : sessionStore = sessionStore ?? const SpaceSecureSessionStore(),
       platform = platform ?? SpacePlatform(),
       _customWidgets = Map.unmodifiable(widgets),
       _ownsDio = dio == null {
    final uri = Uri.tryParse(baseUrl);
    final local =
        uri != null &&
        const {'localhost', '127.0.0.1', '::1'}.contains(uri.host);
    if (uri == null ||
        uri.host.isEmpty ||
        (uri.scheme != 'https' &&
            !(uri.scheme == 'http' && (local || allowInsecureHttp))) ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/')) {
      throw ArgumentError(
        'baseUrl must be the HTTPS server origin (loopback HTTP is allowed for development).',
      );
    }
    if (apiKey.trim().isEmpty) throw ArgumentError('apiKey is required');
    _dio = dio ?? hosted_http.createHostedDio();
    _dio.options.baseUrl = baseUrl;
    _dio.options.headers['x-space-api-key'] = apiKey;
    _dio.options.connectTimeout ??= const Duration(seconds: 15);
    _dio.options.receiveTimeout ??= const Duration(seconds: 30);
    _transport = SpaceDioTransport(_dio);
    services = SpaceServices(
      transport: _send,
      cache: SpaceDocumentCache(),
      storage: documentStorage,
      streams: streams,
      operations: {
        ...this.platform.operations,
        'upload': _transport.upload,
        ...operations,
        'authOAuth': (r) => startOAuthSignIn(
          provider: '${r.data['provider'] ?? 'google'}',
          destination: _oauthDestination(r.data),
        ),
        'authApple': (r) => startOAuthSignIn(
          provider: 'apple',
          destination: _oauthDestination(r.data),
        ),
        'openExternalApp': (r) => openExternalApp('${r.data['name'] ?? ''}'),
        'authLogin': (r) => login(
          email: '${r.data['email'] ?? ''}',
          password: '${r.data['password'] ?? ''}',
        ),
        'authRegister': (r) => register(
          name: '${r.data['name'] ?? ''}',
          email: '${r.data['email'] ?? ''}',
          password: '${r.data['password'] ?? ''}',
        ),
        'authLogout': (_) => logout(),
        'authRequestReset': (r) =>
            _authOperation('/runtime/auth/password/request', r.data),
        'authResetPassword': (r) => _authOperation(
          '/runtime/auth/password/reset',
          r.data,
          saveSession: true,
        ),
        'authRequestOtp': (r) =>
            _authOperation('/runtime/auth/otp/request', r.data),
        'authVerifyOtp': (r) => _authOperation(
          '/runtime/auth/otp/verify',
          r.data,
          saveSession: true,
        ),
      },
    );
  }

  /// Opens only a named destination approved in Studio. The host separately
  /// authorizes custom URL schemes through SpacePlatform.allowedAppSchemes.
  Future<SpaceResult> openExternalApp(String name) async {
    await initialize();
    final response = await _send(
      SpaceRequest(source: '/runtime/integrations/app-links'),
    );
    final links = (response['data'] as Map?)?['links'] as List? ?? [];
    final matches = links.whereType<Map>().where(
      (link) => link['name'] == name,
    );
    if (matches.length != 1) {
      throw StateError('Approved external app link not found');
    }
    return platform.operations['openExternalApp']!(
      SpaceRequest(
        source: 'openExternalApp',
        data: {'url': matches.single['url']},
      ),
    );
  }

  /// Starts system-browser OAuth. Success is delivered by a validated app link,
  /// never by launching the browser. The verifier survives a process restart.
  Future<SpaceResult> startGoogleSignIn() => startOAuthSignIn();

  Map<String, dynamic>? _oauthDestination(Map<String, dynamic> data) {
    final id = data['screenId'];
    if (id == null || id == '') return null;
    if (id is! String || !RegExp(r'^[a-z][a-z0-9_-]{0,63}$').hasMatch(id)) {
      throw ArgumentError('Choose a valid OAuth destination screen');
    }
    return {
      'screenId': id,
      'query': Map<String, dynamic>.from(data['query'] as Map? ?? {}),
      'replace': true,
    };
  }

  Future<SpaceResult> startOAuthSignIn({
    String provider = 'google',
    Map<String, dynamic>? destination,
  }) async {
    if (!const {'google', 'apple'}.contains(provider)) {
      throw ArgumentError.value(provider, 'provider', 'Choose google or apple');
    }
    destination = destination == null ? null : _oauthDestination(destination);
    await initialize();
    final target = oauthReturnUri;
    if (target == null) {
      throw StateError('Configure oauthReturnUri on SpaceClient');
    }
    final verifier = base64UrlEncode(
      List.generate(32, (_) => Random.secure().nextInt(256)),
    ).replaceAll('=', '');
    final challenge = base64UrlEncode(
      sha256.convert(utf8.encode(verifier)).bytes,
    ).replaceAll('=', '');
    final result = await _rawAuth('/runtime/auth/oauth/$provider/start', {
      'returnUri': target.toString(),
      'codeChallenge': challenge,
    });
    final pending = {
      'provider': provider,
      'destination': ?destination,
      'verifier': verifier,
      'returnUri': target.toString(),
      'expires': DateTime.now().millisecondsSinceEpoch + 5 * 60000,
    };
    await sessionStore.write('$_storageKey.oauth', jsonEncode(pending));
    final operation = platform.operations['openUrl']!;
    final opened = await operation(
      SpaceRequest(
        source: 'openUrl',
        data: {'url': result['data']['authorizationUrl']},
      ),
    );
    if (!opened.success) await sessionStore.delete('$_storageKey.oauth');
    return SpaceResult(
      success: false,
      cancelled: !opened.success,
      data: {'status': opened.success ? 'pending' : 'notOpened'},
      message: opened.success
          ? 'Complete sign-in in your browser.'
          : 'Unable to open sign-in.',
    );
  }

  /// Only configured exact return destinations are accepted. Payment status is
  /// fetched from the authenticated backend; URL status fields are ignored.
  Future<bool> handleReturnLink(Uri uri) {
    final result = Completer<bool>();
    _linkPending = _linkPending.catchError((Object _) {}).then((_) async {
      try {
        result.complete(await _handleReturnLink(uri));
      } catch (error, stack) {
        result.completeError(error, stack);
      }
    });
    return result.future;
  }

  Future<bool> _handleReturnLink(Uri uri) async {
    await initialize();
    if (_disposed) return false;
    if (oauthReturnUri != null && spaceMatchesReturnUri(uri, oauthReturnUri!)) {
      final raw = await sessionStore.read('$_storageKey.oauth');
      if (raw == null) return false;
      final pending = jsonDecode(raw) as Map;
      if (pending['returnUri'] != oauthReturnUri.toString() ||
          (pending['expires'] as num) < DateTime.now().millisecondsSinceEpoch) {
        await sessionStore.delete('$_storageKey.oauth');
        return false;
      }
      if (uri.queryParameters.containsKey('oauthError')) {
        await sessionStore.delete('$_storageKey.oauth');
        return true;
      }
      final codes = uri.queryParametersAll['oauthCode'];
      if (codes == null || codes.length != 1) return false;
      final generation = _generation;
      final provider = pending['provider'] ?? 'google';
      if (!const {'google', 'apple'}.contains(provider)) return false;
      final session = await _rawAuth('/runtime/auth/oauth/$provider/exchange', {
        'code': codes.single,
        'codeVerifier': pending['verifier'],
      });
      await _saveSession(
        Map<String, dynamic>.from(session['data'] as Map),
        generation: generation,
      );
      await sessionStore.delete('$_storageKey.oauth');
      if (!_disposed && generation == _generation) {
        _emitDestination(
          pending['destination'] is Map
              ? Map<String, dynamic>.from(pending['destination'] as Map)
              : {'source': '/runtime/start', 'replace': true},
        );
      }
      return true;
    }
    if (paymentReturnUri != null &&
        spaceMatchesReturnUri(uri, paymentReturnUri!)) {
      final ids = uri.queryParametersAll['orderId'];
      if (!signedIn ||
          ids == null ||
          ids.length != 1 ||
          ids.single.length > 100) {
        return false;
      }
      final generation = _generation;
      final result = await _send(
        SpaceRequest(
          source: '/runtime/commerce/verify',
          method: 'POST',
          data: {'orderId': ids.single},
        ),
      );
      if (!_disposed &&
          generation == _generation &&
          result['success'] == true) {
        _emitDestination({
          'screenId': 'order',
          'query': {'orderId': ids.single},
        });
      }
      return true;
    }
    return false;
  }

  Future<void> registerPushToken(
    String token, {
    String platform = 'unknown',
  }) async {
    await initialize();
    if (!signedIn) return;
    final generation = _generation;
    await _send(
      SpaceRequest(
        source: '/runtime/push/devices',
        method: 'POST',
        data: {'token': token, 'platform': platform},
      ),
    );
    if (!_disposed && generation == _generation) _pushToken = token;
  }

  Future<void> unregisterPushToken() async {
    final token = _pushToken;
    if (token == null) return;
    if (signedIn) {
      await _send(
        SpaceRequest(
          source: '/runtime/push/devices/remove',
          method: 'POST',
          data: {'token': token},
        ),
      );
    }
    _pushToken = null;
  }

  Future<bool> openNotification(String id) async {
    await initialize();
    if (!signedIn || id.isEmpty || id.length > 100) return false;
    final generation = _generation;
    final result = await _send(
      SpaceRequest(
        source: '/runtime/push/notifications/${Uri.encodeComponent(id)}',
      ),
    );
    if (_disposed || generation != _generation || result['success'] != true) {
      return false;
    }
    _emitDestination(Map<String, dynamic>.from(result['data'] as Map));
    return true;
  }

  bool get signedIn => _session != null;
  Map<String, dynamic>? get user => _session?['user'] is Map
      ? Map<String, dynamic>.unmodifiable(_session!['user'] as Map)
      : null;
  int get sessionEpoch => _sessionEpoch;
  String get _storageKey =>
      'spacewidget.session.${sha256.convert(utf8.encode('$baseUrl|$apiKey'))}';
  Map<String, SpaceWidgetBuilder> get widgets => {
    ...platform.widgets,
    ...spaceAuthWidgets(this),
    ..._customWidgets,
  };

  Future<void> initialize() => _initialization ??= _restore();
  Future<void> _restore() async {
    final generation = _generation;
    final raw = await sessionStore.read(_storageKey);
    if (raw == null || _disposed || generation != _generation) return;
    try {
      final decoded = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      _validateSession(decoded);
      _session = decoded;
      _headers();
      if ((decoded['expiresAt'] as num) <=
          DateTime.now().millisecondsSinceEpoch + 30000) {
        await _refresh();
      } else {
        _publishAuth();
      }
    } on FormatException {
      await _clear();
    } on DioException catch (error) {
      if (error.response?.statusCode == 401) {
        await _clear();
      } else {
        rethrow;
      }
    }
  }

  void _validateSession(Map<String, dynamic> value) {
    if (value['accessToken'] is! String ||
        value['refreshToken'] is! String ||
        value['expiresAt'] is! num ||
        value['user'] is! Map ||
        value['user']['id'] is! String) {
      throw const FormatException('Invalid saved session');
    }
  }

  void _headers() {
    _dio.options.headers.remove('Authorization');
    _dio.options.headers.remove('authorization');
    if (_session != null) {
      _dio.options.headers['Authorization'] =
          'Bearer ${_session!['accessToken']}';
    }
  }

  void _publishAuth() {
    if (_disposed) return;
    controller.setValue('auth', {'signedIn': signedIn, 'user': user});
    notifyListeners();
  }

  Future<void> _serializeStorage(Future<void> Function() operation) {
    final next = _storagePending.then((_) => operation());
    _storagePending = next.catchError((Object _) {});
    return next;
  }

  Future<void> _saveSession(Map<String, dynamic> value, {int? generation}) {
    _validateSession(value);
    final expected = generation ?? _generation;
    return _serializeStorage(() async {
      if (_disposed || expected != _generation) return;
      await sessionStore.write(_storageKey, jsonEncode(value));
      if (_disposed || expected != _generation) return;
      final previous = user?['id'];
      if (previous != null && previous != value['user']['id']) {
        services.cache?.clear();
        await documentStorage?.clear();
        if (_disposed || expected != _generation) return;
        _sessionEpoch++;
      }
      _session = value;
      _headers();
      _publishAuth();
    });
  }

  Future<void> _clear() async {
    _queuedDestinations.clear();
    _pushToken = null;
    _generation++;
    final hadSession = _session != null;
    _session = null;
    _headers();
    services.cache?.clear();
    if (hadSession) _sessionEpoch++;
    if (!_disposed) {
      controller.reset({
        'auth': {'signedIn': false, 'user': null},
      });
      notifyListeners();
    }
    await _serializeStorage(() async {
      await sessionStore.delete(_storageKey);
      await sessionStore.delete('$_storageKey.oauth');
      await documentStorage?.clear();
    });
  }

  Future<Map<String, dynamic>> _rawAuth(
    String source,
    Map<String, dynamic> data,
  ) =>
      _transport.call(SpaceRequest(source: source, method: 'POST', data: data));

  Future<void> _refresh() =>
      _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  Future<void> _doRefresh() async {
    final current = _session;
    if (current == null) return;
    final generation = _generation;
    try {
      final result = await _rawAuth('/runtime/auth/refresh', {
        'refreshToken': current['refreshToken'],
      });
      if (_disposed || generation != _generation || _session == null) return;
      await _saveSession(
        Map<String, dynamic>.from(result['data'] as Map),
        generation: generation,
      );
    } on DioException catch (error) {
      if (error.response?.statusCode == 401 && generation == _generation) {
        await _clear();
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _fetch(SpaceRequest request) async {
    final result = await _transport.call(request);
    final theme = result['theme'];
    final title = result['app'] is Map ? result['app']['name'] : null;
    if (!_disposed && (theme is Map<String, dynamic> || title is String)) {
      final next = theme is Map<String, dynamic>
          ? freezeJsonMap(theme)
          : _theme;
      final nextTitle = title is String ? title : _title;
      final nextDark = result['darkTheme'] is Map
          ? freezeJsonMap(Map<String, dynamic>.from(result['darkTheme'] as Map))
          : null;
      final nextMode = result['themeMode']?.toString() ?? 'light';
      if (jsonEncode(next) != jsonEncode(_theme) ||
          nextTitle != _title ||
          jsonEncode(nextDark) != jsonEncode(_darkTheme) ||
          nextMode != _themeMode) {
        _darkTheme = nextDark;
        _themeMode = nextMode;
        _theme = next;
        _title = nextTitle;
        notifyListeners();
      }
    }
    return result;
  }

  Future<Map<String, dynamic>> _send(SpaceRequest request) async {
    await initialize();
    if (_disposed) throw StateError('SpaceClient is disposed');
    if (_session != null &&
        (_session!['expiresAt'] as num) <
            DateTime.now().millisecondsSinceEpoch + 30000) {
      try {
        await _refresh();
      } on DioException catch (error) {
        if (error.response?.statusCode != 401) rethrow;
      }
    }
    try {
      return await _fetch(request);
    } on DioException catch (error) {
      if (error.response?.statusCode != 401 ||
          (error.response?.data is Map &&
              error.response?.data['code'] == 'APP_KEY_INVALID')) {
        final body = error.response?.data;
        final screenRequest =
            request.source == '/runtime/start' ||
            request.source.startsWith('/runtime/screens/');
        if (!screenRequest &&
            body is Map<String, dynamic> &&
            body['success'] == false) {
          return body;
        }
        rethrow;
      }
      if (_session != null && request.method.toUpperCase() == 'GET') {
        try {
          await _refresh();
          if (_session != null) return await _fetch(request);
        } on DioException catch (refreshError) {
          if (refreshError.response?.statusCode != 401) rethrow;
          if (_session != null) await _clear();
        }
      }
      if (request.source == '/runtime/start' ||
          request.source.startsWith('/runtime/screens/')) {
        return {
          'success': true,
          'widgets': {
            'type': 'scaffold',
            'appBar': {'type': 'appBar', 'title': 'Sign in'},
            'body': {
              'type': 'safeArea',
              'child': {
                'type': 'singleChildScrollView',
                'padding': 24,
                'child': {
                  'type': 'loginForm',
                  'onSuccess': {'type': 'refresh'},
                },
              },
            },
          },
        };
      }
      rethrow;
    }
  }

  Future<SpaceResult> _authOperation(
    String path,
    Map<String, dynamic> data, {
    bool saveSession = false,
  }) async {
    await initialize();
    final generation = _generation;
    try {
      final result = await _rawAuth(path, data);
      if (_disposed || generation != _generation) {
        return SpaceResult(success: false, cancelled: true);
      }
      if (saveSession) {
        await _saveSession(
          Map<String, dynamic>.from(result['data'] as Map),
          generation: generation,
        );
      }
      if (_disposed || generation != _generation) {
        return SpaceResult(success: false, cancelled: true);
      }
      final publicData = Map<String, dynamic>.from(result['data'] as Map? ?? {})
        ..remove('accessToken')
        ..remove('refreshToken')
        ..remove('expiresAt');
      return SpaceResult(
        success: result['success'] == true,
        data: {
          ...publicData,
          if (result['message'] != null) 'message': result['message'],
        },
      );
    } on DioException catch (error) {
      final body = error.response?.data;
      final message = body is Map
          ? '${body['message'] ?? 'Unable to sign in'}'
          : 'Unable to reach the server. Please try again.';
      return SpaceResult(
        success: false,
        message: message,
        data: {'message': message},
      );
    }
  }

  Future<SpaceResult> login({
    required String email,
    required String password,
  }) => _authOperation('/runtime/auth/login', {
    'email': email,
    'password': password,
  }, saveSession: true);
  Future<SpaceResult> register({
    required String name,
    required String email,
    required String password,
  }) => _authOperation('/runtime/auth/register', {
    'name': name,
    'email': email,
    'password': password,
  }, saveSession: true);
  Future<SpaceResult> logout() async {
    // Local logout is immediate. The backend revokes this session's device
    // registrations when consuming its refresh token; push permission changes
    // use unregisterPushToken independently.
    final refresh = _session?['refreshToken'];
    _initialization = Future.value();
    await _clear();
    if (refresh != null) {
      try {
        await _rawAuth('/runtime/auth/logout', {'refreshToken': refresh});
      } on DioException {
        return SpaceResult(
          success: true,
          message: 'Signed out on this device. Server revocation could not be confirmed.',
        );
      }
    }
    return SpaceResult(success: true);
  }

  @override
  void dispose() {
    unawaited(_destinations.close());
    _queuedDestinations.clear();
    _disposed = true;
    _generation++;
    if (_ownsDio) _dio.close(force: true);
    controller.dispose();
    super.dispose();
  }
}

/// Connect a Flutter app with just a server origin and publishable runtime key.
/// Supply an existing client when the host manages its lifetime and adapters.
class SpaceHostedApp extends StatefulWidget {
  final String? baseUrl, apiKey;
  final SpaceClient? client;
  final SpaceSessionStore? sessionStore;
  final ValueChanged<SpaceIssue>? onError;
  const SpaceHostedApp({
    super.key,
    required String this.baseUrl,
    required String this.apiKey,
    this.sessionStore,
    this.onError,
  }) : client = null;
  const SpaceHostedApp.client({
    super.key,
    required SpaceClient this.client,
    this.onError,
  }) : baseUrl = null,
       apiKey = null,
       sessionStore = null;
  @override
  State<SpaceHostedApp> createState() => _SpaceHostedAppState();
}

class _SpaceHostedAppState extends State<SpaceHostedApp> {
  late SpaceClient _client;
  late Future<void> _ready;
  GlobalKey<NavigatorState> _navigator = GlobalKey<NavigatorState>();
  int _navigatorEpoch = -1;
  StreamSubscription<Map<String, dynamic>>? _destinationSubscription;
  void _destination(Map<String, dynamic> destination) {
    if (!mounted) return;
    final nav = _navigator.currentState;
    if (nav == null) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _destination(destination),
      );
      return;
    }
    final screen = destination['screenId'];
    final start = destination['source'] == '/runtime/start';
    if (!start &&
        (screen is! String ||
            !RegExp(r'^[a-z][a-z0-9_-]{0,63}$').hasMatch(screen))) {
      return;
    }
    final route = MaterialPageRoute<void>(
      builder: (_) => SpaceRemoteScreen(
        source: start ? '/runtime/start' : '/runtime/screens/$screen',
        query: Map<String, dynamic>.from(destination['query'] as Map? ?? {}),
        services: _client.services,
        appController: _client.controller,
        widgets: _client.widgets,
        onError: widget.onError,
      ),
    );
    unawaited(
      destination['replace'] == true
          ? nav.pushReplacement(route)
          : nav.push(route),
    );
  }

  void _open() {
    _navigatorEpoch = -1;
    _navigator = GlobalKey<NavigatorState>();
    _client =
        widget.client ??
        SpaceClient(
          baseUrl: widget.baseUrl!,
          apiKey: widget.apiKey!,
          sessionStore: widget.sessionStore,
        );
    unawaited(_destinationSubscription?.cancel());
    _destinationSubscription = _client.destinations.listen(_destination);
    _ready = _client.initialize();
  }

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void didUpdateWidget(covariant SpaceHostedApp oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.client != widget.client ||
        oldWidget.baseUrl != widget.baseUrl ||
        oldWidget.apiKey != widget.apiKey ||
        oldWidget.sessionStore != widget.sessionStore) {
      if (oldWidget.client == null) _client.dispose();
      _open();
    }
  }

  @override
  void dispose() {
    unawaited(_destinationSubscription?.cancel());
    if (widget.client == null) _client.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<void>(
    future: _ready,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return MaterialApp(
          home: Scaffold(
            body: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Unable to restore this session.'),
                  TextButton(
                    onPressed: () => setState(() {
                      _ready = _client.logout().then((_) {});
                    }),
                    child: const Text('Start a new session'),
                  ),
                ],
              ),
            ),
          ),
        );
      }
      if (snapshot.connectionState != ConnectionState.done) {
        return const MaterialApp(
          home: Scaffold(body: Center(child: CircularProgressIndicator())),
        );
      }
      return AnimatedBuilder(
        animation: _client,
        builder: (context, _) {
          if (_navigatorEpoch != _client.sessionEpoch) {
            _navigatorEpoch = _client.sessionEpoch;
            _navigator = GlobalKey<NavigatorState>();
          }
          return SpaceApp(
            key: ValueKey((_client, _client.sessionEpoch)),
            config: {
              'initialSource': '/runtime/start',
              'title': _client.title,
              'theme': _client.theme,
              'darkTheme': _client.darkTheme,
              'themeMode': _client.themeMode,
            },
            navigatorKey: _navigator,
            controller: _client.controller,
            services: _client.services,
            widgets: _client.widgets,
            onError: widget.onError,
          );
        },
      );
    },
  );
}
