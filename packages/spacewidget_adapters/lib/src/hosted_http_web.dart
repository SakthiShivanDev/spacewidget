import 'package:dio/browser.dart';
import 'package:dio/dio.dart';

Dio createHostedDio() => Dio()
  ..httpClientAdapter = BrowserHttpClientAdapter(
    // Studio explicitly handles app-key, bearer-token and JSON preflights.
    // Suppress only the advance notice; Dio still reports real request errors.
    enableCORSWarning: false,
  );
