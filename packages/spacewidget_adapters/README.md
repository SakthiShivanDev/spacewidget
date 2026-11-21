# SpaceWidget adapters

Optional HTTP, media, file/camera, map, PDF, web view, storage, and hosted-checkout integrations. The parent `spacewidget` package remains Flutter-only. This local companion package has not been published.

```dart
final dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));
// Configure authentication/refresh/logging interceptors in the host.
final transport = SpaceDioTransport(dio);
final platform = SpacePlatform(
  tileUrl: 'https://your-tile-provider/{z}/{x}/{y}.png',
  attribution: 'Your map provider attribution',
  userAgentPackageName: 'com.example.app',
  allowedWebHosts: {'checkout.example.com', 'documents.example.com'},
);
final services = SpaceServices(
  transport: transport.call,
  operations: {...platform.operations, 'upload': transport.upload},
  streams: {
    'updates': spaceWebSocketStream(
      endpoint: (request) => Uri.https('api.example.com', request.source)
          .replace(scheme: 'wss'),
    ),
  },
);
runApp(SpaceApp(
  config: {'initialSource': '/ui/home'},
  services: services,
  widgets: platform.widgets,
));
```

Close the owned Dio client when the host is disposed. API requests preserve Dio interceptors and client configuration. They stay on the configured origin and do not follow redirects by default; prefer separate configured clients for different services. Authentication credentials belong in the host, not screen JSON. Media/PDF/caption/map URLs are independent public or signed resource URLs and do not inherit API authorization headers.

| Integration | Implementation and contract |
| --- | --- |
| API / multipart | Dio; response is a JSON object with boolean `success`; upload takes `data.files` with base64 bytes |
| Live data | WebSocket JSON snapshots; host builds endpoint/subscribe message; cancellation closes connection |
| `videoPlayer`, `audioPlayer` | Flutter video_player; `src`, `autoplay`, `loop`, WebVTT `captions`, seconds `positionBind`, `onComplete`; seek/play/pause/mute UI |
| `map` | flutter_map; host tile URL/attribution; latitude/longitude, zoom, marker list, location `bind`, `onChanged` |
| `documentViewer` | PDFx; `src`, optional `height`; Linux opens PDF externally |
| `webView` | webview_flutter on Android/iOS/macOS, external browser elsewhere; `src`, optional `height` |
| `filePicker`, `cameraInput` | file_selector / image_picker; `name`, `bind`, `required`, `label`; participate in form validation/save |
| File operations | `pickFiles`, `capturePhoto`; injectable selectors, total selection limit defaults to 20 MiB |
| URL / checkout | url_launcher; `openUrl` and `checkout` with HTTPS URL and optional sessionId |
| Offline documents | shared_preferences async; opt-in `SpacePreferencesDocumentStore` implementing core storage |

`checkout` opens a backend-created hosted checkout URL. It returns `success: false` with pending/notOpened status; opening a browser never confirms payment. Start with a hosted flow such as Stripe Checkout and let your backend verify the payment provider/webhook before returning a successful order. Subscribe to order state or make an explicit verification request; do not trust redirect parameters as payment proof.

Web URLs require HTTPS and optionally a host allowlist. Web-view JavaScript is disabled unless the host sets `allowJavaScript: true`. `allowInsecureLocalhost` permits HTTP loopback resources for local demos only. SDK credentials and provider billing limits stay in the host/provider configuration.

## Platform setup

- Add runners to your consuming Flutter app for the platforms you ship. The repository demo currently has a web runner.
- Follow [video_player](https://pub.dev/packages/video_player), [image_picker](https://pub.dev/packages/image_picker), [file_selector](https://pub.dev/packages/file_selector), [flutter_map](https://docs.fleaflet.dev/), [webview_flutter](https://pub.dev/packages/webview_flutter), and [PDFx](https://pub.dev/packages/pdfx) platform instructions. Native SDK support varies; the default video plugin does not provide Linux/Windows playback.
- Android needs internet access; camera and iOS camera/photo-library usage declarations depend on the selected capabilities. macOS network/file entitlements and desktop camera support require platform-specific setup. Camera capture is not uniformly supported on desktop/web; provide an appropriate injectable capture function.
- PDFx web needs PDF.js: run `dart run pdfx:install_web` in the consuming app. This is already configured in the example. The generated setup uses a CDN; self-host those assets if your deployment requires it. Windows has an additional PDFx installation script.
- Browser autoplay, camera access, CORS, HTTPS, media codecs, PDF resource access, and WebSocket policies still apply. Use an HTTPS API and wss in deployed apps. The demo uses loopback HTTP.
- Supply a map tile provider appropriate for your traffic and its attribution. The example's public OpenStreetMap tiles are demonstration configuration, not an unlimited production service.
- Persist only cache-approved screen JSON. The preferences store is unencrypted; isolate account namespaces and clear it on sign-out. It is not a clinical-record store or offline transaction queue.

See [API contracts](../../docs/remote-apps.md) and the [runnable demo](../../example/README.md). Adapter tests use SDK mocks for device-only operations; passing them does not certify playback, camera, PDFs, maps or checkout on every target device.
