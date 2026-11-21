import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Reuses the application's configured Dio instance and its interceptors.
/// Restrict destinations to the app API origin by default, including absolute
/// URLs. Use a separate Dio/service instance for a different trusted service.
class SpaceDioTransport {
  final Dio dio;
  final bool allowExternalOrigins;
  const SpaceDioTransport(this.dio, {this.allowExternalOrigins = false});

  Uri _uri(String source) {
    final base = Uri.parse(dio.options.baseUrl);
    final uri = base.resolve(source);
    if (uri.scheme != 'http' && uri.scheme != 'https') {
      throw const FormatException('HTTP source required');
    }
    if (!allowExternalOrigins &&
        (uri.scheme != base.scheme ||
            uri.host != base.host ||
            uri.port != base.port)) {
      throw const FormatException(
        'Request source is outside the configured API origin',
      );
    }
    return uri;
  }

  Future<Map<String, dynamic>> call(SpaceRequest request) async {
    final uri = _uri(request.source);
    final cancel = CancelToken();
    request.cancellation?.onCancel(
      () => cancel.cancel('Screen disposed or superseded'),
    );
    final response = await dio.request<dynamic>(
      uri.toString(),
      queryParameters: request.query,
      data: request.data.isEmpty ? null : request.data,
      options: Options(
        method: request.method,
        followRedirects: allowExternalOrigins,
      ),
      cancelToken: cancel,
    );
    final value = response.data is String
        ? jsonDecode(response.data)
        : response.data;
    if (value is! Map<String, dynamic>) {
      throw const FormatException('API response must be a JSON object');
    }
    return value;
  }

  /// Multipart upload operation for files selected through SpacePlatform.
  /// Base64 file content remains portable across web and native platforms.
  Future<SpaceResult> upload(SpaceRequest request) async {
    final uri = _uri(request.source);
    final files = request.data['files'];
    if (files is! List || files.isEmpty) {
      throw const FormatException('upload.files must be nonempty');
    }
    final data = Map<String, dynamic>.from(request.data)..remove('files');
    final parts = <MultipartFile>[];
    for (final file in files) {
      if (file is! Map || file['name'] is! String || file['bytes'] is! String) {
        throw const FormatException('Each file needs name and base64 bytes');
      }
      final Uint8List bytes = base64Decode(file['bytes']);
      parts.add(MultipartFile.fromBytes(bytes, filename: file['name']));
    }
    final cancel = CancelToken();
    request.cancellation?.onCancel(() => cancel.cancel());
    final response = await dio.request<dynamic>(
      uri.toString(),
      data: FormData.fromMap({...data, 'files': parts}),
      options: Options(
        method: request.method == 'GET' ? 'POST' : request.method,
        followRedirects: allowExternalOrigins,
      ),
      cancelToken: cancel,
    );
    if (response.data is! Map<String, dynamic>) {
      throw const FormatException('Upload response must be a JSON object');
    }
    return SpaceResult.fromJson(response.data);
  }
}

/// Creates a new socket per subscriber. Cancellation closes the socket.
/// Auth can be supplied in the endpoint or first subscribe message by the host.
SpaceStreamFactory spaceWebSocketStream({
  required Uri Function(SpaceRequest) endpoint,
  Object? Function(SpaceRequest)? subscribeMessage,
}) => (request) async* {
  final uri = endpoint(request);
  if (uri.scheme != 'ws' && uri.scheme != 'wss') {
    throw const FormatException('WebSocket endpoint required');
  }
  final channel = WebSocketChannel.connect(uri);
  try {
    await channel.ready;
    final message = subscribeMessage?.call(request);
    if (message != null) {
      channel.sink.add(message is String ? message : jsonEncode(message));
    }
    await for (final event in channel.stream) {
      final decoded = jsonDecode(
        event is String ? event : utf8.decode((event as List).cast<int>()),
      );
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Live events must be JSON objects');
      }
      yield decoded;
    }
  } finally {
    await channel.sink.close();
  }
};
