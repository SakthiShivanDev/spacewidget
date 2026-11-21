import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:spacewidget_example/demo_api.dart';

Future<void> main(List<String> args) async {
  final port = args.isEmpty ? 8080 : int.parse(args.first);
  final api = DemoApi();
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
  stdout.writeln('SpaceWidget demo API: http://127.0.0.1:${server.port}');
  await for (final request in server) {
    unawaited(_serve(request, api));
  }
}

Future<void> _serve(HttpRequest request, DemoApi api) async {
  if (WebSocketTransformer.isUpgradeRequest(request)) {
    final socket = await WebSocketTransformer.upgrade(request);
    socket.add(jsonEncode(api.live(request.uri.path)));
    final timer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (request.uri.path == '/live/order') api.deliveryStage++;
      socket.add(jsonEncode(api.live(request.uri.path)));
    });
    socket.listen((_) {}, onDone: timer.cancel, onError: (_) => timer.cancel());
    return;
  }
  final response = request.response;
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'content-type, authorization',
  );
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (request.method == 'OPTIONS') {
    response.statusCode = 204;
    await response.close();
    return;
  }
  if (request.uri.path == '/documents/sample.pdf') {
    response.headers.contentType = ContentType('application', 'pdf');
    await response.addStream(File('assets/sample.pdf').openRead());
    await response.close();
    return;
  }
  response.headers.contentType = ContentType.json;
  try {
    Map<String, dynamic> data = {};
    if (request.method != 'GET') {
      if (request.headers.contentType?.mimeType == 'application/json') {
        final raw = await utf8.decoder.bind(request).join();
        if (raw.isNotEmpty) {
          data = Map<String, dynamic>.from(jsonDecode(raw) as Map);
        }
      } else {
        await request.drain<void>();
      }
    }
    final result = await api.handle(
      request.uri.path,
      method: request.method,
      data: data,
      query: request.uri.queryParameters,
    );
    response.write(jsonEncode(result));
  } catch (_) {
    response.statusCode = 400;
    response.write(
      jsonEncode({'success': false, 'message': 'Invalid demo request'}),
    );
  }
  await response.close();
}
