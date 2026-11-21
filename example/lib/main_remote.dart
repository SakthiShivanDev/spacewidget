import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:spacewidget/spacewidget.dart';
import 'package:spacewidget_adapters/spacewidget_adapters.dart';

void main() => runApp(const RemoteDemoApp());

class RemoteDemoApp extends StatefulWidget {
  const RemoteDemoApp({super.key});
  @override
  State<RemoteDemoApp> createState() => _RemoteDemoAppState();
}

class _RemoteDemoAppState extends State<RemoteDemoApp> {
  late final Dio _dio;
  late final SpaceServices _services;
  late final SpacePlatform _platform;
  @override
  void initState() {
    super.initState();
    const apiUrl = String.fromEnvironment(
      'SPACE_API_URL',
      defaultValue: 'http://127.0.0.1:8080',
    );
    final base = Uri.parse(apiUrl);
    _dio = Dio(BaseOptions(baseUrl: apiUrl));
    final transport = SpaceDioTransport(_dio);
    _platform = SpacePlatform(
      allowInsecureLocalhost: true,
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      userAgentPackageName: 'com.spacewidget.example',
    );
    _services = SpaceServices(
      transport: transport.call,
      operations: {..._platform.operations, 'upload': transport.upload},
      streams: {
        'updates': spaceWebSocketStream(
          endpoint: (request) => base.replace(
            scheme: base.scheme == 'https' ? 'wss' : 'ws',
            path: request.source,
          ),
        ),
      },
      cache: SpaceDocumentCache(),
      storage: SpacePreferencesDocumentStore(namespace: 'demo-public'),
    );
  }

  @override
  void dispose() {
    _dio.close(force: true);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SpaceApp(
    config: {
      'title': 'SpaceWidget workspaces',
      'state': {'apiBase': _dio.options.baseUrl},
      'initialSource': '/ui/home',
      'theme': {'seedColor': '#4F46E5'},
    },
    services: _services,
    widgets: _platform.widgets,
    onError: (issue) => debugPrint(issue.toString()),
  );
}
