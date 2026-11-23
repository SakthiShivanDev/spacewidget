# SpaceWidget examples

Three entry points demonstrate the Flutter-only core, custom service adapters, and the hosted Studio client.

## Hosted Studio app

Start the [separate Studio service](../studio/README.md), create an app, publish a release and create its API key. From `example`:

```sh
flutter pub get
flutter run -d chrome -t lib/main_hosted.dart \
  --dart-define=SPACE_STUDIO_URL=http://localhost:4100 \
  --dart-define=SPACE_STUDIO_KEY=YOUR_PUBLISHABLE_RUNTIME_KEY
```

Use your HTTPS origin when deploying. The key identifies the app and is expected to be distributed with it; it does not grant access to builder administration or private user records. The hosted entry point uses the client's secure session store; complete the consuming platform's secure-storage setup for native builds.

## Remote application workspaces

Run the local reference API from this directory:

```sh
flutter pub get
dart run tool/demo_server.dart
```

In another terminal, also from `example`:

```sh
flutter run -d chrome -t lib/main_remote.dart
```

The API listens at `http://127.0.0.1:8080`. Pass a different port to the server command if needed; use `--dart-define=SPACE_API_URL=http://127.0.0.1:8081` for the client. The server binds loopback; device demos need an intentionally reachable development API and platform network configuration. Use HTTPS for deployment.

| Workspace | Executable flow |
| --- | --- |
| Shop | Variant/quantity → server cart total → synthetic checkout confirmation |
| Watch | Media playback, resume position, progress save and completion |
| Learn | Lesson → required quiz answer → server-recorded completion |
| Health | Patient/slot form → duplicate-slot rejection; synthetic PDF and document selection |
| Food | Extras/preferences → order → live status and map position |
| Messages | Live message snapshots and validated send form |
| Travel | Date-range/guest form → demo reservation |
| Admin | Charts and numeric table sorting, selection and local pagination |

`lib/demo_api.dart` is shared by HTTP server and workflow tests. Screens arrive through `/ui/*`; actions use `/actions/*`; `/data/products` demonstrates cursor pages; `/live/*` provides WebSocket snapshots. The backend is in memory, has no authentication, shares data between clients, and resets on restart. Payments, appointment fulfilment, and orders are demonstrations. Use synthetic documents only. SDK resource loads still need network access.

## Local JSON dashboard

```sh
flutter run -d chrome -t lib/main_local.dart
```

`lib/main_local.dart` loads `assets/app.json`, demonstrating themes, navigation, profile validation, dialogs, shared bindings, and a custom status widget without the API server.

## Validation and builds

```sh
flutter test
flutter build web --release -t lib/main_remote.dart
```

The checked-in runner targets web. Add native runners only for the platforms you intend to ship, then follow [adapter setup](../packages/spacewidget_adapters/README.md). PDF.js is configured in `web/index.html` by PDFx's installer. Tests exercise workflow state and actions; platform playback, camera, PDFs, maps, and real payment/provider callbacks require target-device validation.
