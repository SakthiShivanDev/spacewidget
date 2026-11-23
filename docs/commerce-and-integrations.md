# Commerce demo and integrations

The repository includes a separately hosted Studio, the Flutter renderer, hosted-client/platform adapters, and an optional Firebase package. The `Everyday Commerce` template is a working reference app for product browsing, search/category filters, product sheets, login/registration, a persisted user cart, delivery checkout, payment confirmation/cancellation, order history, account tabs and an owned notification inbox.

## Open the local app

Select **Everyday Commerce** in Studio to edit its seven screens and two reusable components. The local published demo is served at `http://localhost:4100/commerce-demo/` after building it and restarting Studio.

```sh
cd studio
npm run demo:create
FLUTTER_BIN=/path/to/flutter npm run demo:build
npm start
```

The creator preserves existing applications and saves the new demo's publishable key in ignored `studio/data/commerce-demo.json`. It creates only one demo; repeat runs preserve its edits, releases and data. If multiple builder accounts exist, specify `-- --owner-email you@example.com`. Runtime keys are publishable and do not grant access to private customer records without a user session.

Set `SPACE_DEMO_PAYMENTS=true` for local test checkout. The screen labels simulated confirmation as a **TEST payment, with no money charged**. The server always rejects simulated confirmation in production. This setting does not turn a real provider payment into a test payment.

## Database URL in the environment

```dotenv
APP_DATABASE_URL=postgresql://app_user:password@db.example.com:5432/app?sslmode=verify-full
STUDIO_DB_HOSTS=db.example.com
# APP_DATABASE_CA=...             # optional PEM for your private CA
# APP_DATABASE_TLS=false          # only for an explicitly trusted local DB
```

Restart Studio, then choose **Data → Connect database → Connection settings → Use APP_DATABASE_URL**. **Test and connect** checks the database and permissions before saving the connection. The saved reference contains the environment variable's name; database credentials never enter the browser or screen JSON. `DATABASE_URL` is accepted as a hosting-platform fallback. URL query options support `sslmode`; configure other TLS settings explicitly.

All Studio metadata, sessions, managed app tables and reference commerce records now use PostgreSQL through `STUDIO_DATABASE_URL` (or `DATABASE_URL`). External connectors can use `APP_DATABASE_URL`. Preserve `STUDIO_MASTER_KEY` with database backups. See [platform setup](platform-setup.md).

## Guided widget actions

Select a button or a navigation destination and choose its action in the inspector:

- Open/replace a screen, with query parameters and optional reload on return.
- Open a bottom sheet or alert dialog, using an editable widget tree or reusable component. Select **Edit overlay content in Layers**, then customize its content and buttons.
- Close an overlay or screen with a result. Save the result to state and configure **After closing** for a follow-up refresh/request. Dismissal by tapping outside returns `null`.
- Switch a tab by its zero-based number. The trigger must be inside its Default Tab Controller. Tab taps, swipes and bound-state changes stay synchronized.
- Call an API, validate/submit a form, or run a host integration. Submit can target an integration such as `authLogin`, preserving form validation and secure session handling.
- Run an action conditionally from a boolean or data binding, including checking an overlay result before acting on it.
- Run several actions in order, configure success/failure actions, show a message, change state or reload screen data. Failed/cancelled service actions stop subsequent steps.

Bottom navigation works without an explicit binding and supplies `{{event.index}}`, `{{event.value}}` and `{{event.item}}` to its event action. Tab changes supply the index/value. Overlay close actions supply `{{event.result}}` to **After closing**. Event bindings are scoped to the action invocation rather than stored as mutable global state.

The Studio canvas is an authoring preview. Double-click to interact; service writes are deliberately restricted there. Use the separate connected demo app to exercise authenticated writes and checkout. The same Flutter renderer and published theme are used by both.

## Custom APIs and data binding

Set `STUDIO_HTTP_HOSTS=api.example.com` on the server. In Studio's Data page, **Connect your own API** saves an approved HTTPS origin, named endpoint, HTTP method and optional credential header. Header values are encrypted server-side and never published. Only explicitly public GET endpoints can be used by public screens.

Connect a saved GET endpoint to a screen and give its response a data name, for example `coursesApi`. The server includes that JSON in the screen's single response. For a response shaped as `{ "items": [{ "name": "Course" }] }`, repeat `{{coursesApi.items}}` and bind text inside the template to `{{item.name}}`. The Data inspector discovers nested record/list fields from preview samples. Use **Database data** to inspect a real response and choose an app user for private sources.

Widget actions call `/runtime/http/<service-id>/<endpoint-id>` with the saved method. Configure request data/query, a response state path and success/failure actions. A top-level array action response is available as `<resultPath>.value`; screen sources preserve their original JSON shape. Endpoint paths cannot escape the approved origin; redirects are rejected, calls time out and JSON responses are limited to 1 MB. Server calls add `X-Space-App-ID` and, for signed-in requests, `X-Space-User-ID`. Your upstream API must authenticate the configured service credential and enforce that identity for its own resources.

## Google sign-in

Configure server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` and the exact permitted `SPACE_AUTH_RETURN_URLS`. Register the callback in Google Cloud. Add an `authOAuth` action and configure `oauthReturnUri` on `SpaceClient`.

The implementation uses state, nonce and S256 PKCE, validates Google ID-token signatures/issuer/audience, requires a verified email, and exchanges a short-lived, one-use redirect code for a session. Access/refresh tokens never appear in redirect URLs. An existing password account is not automatically linked by matching its email; authenticated account linking is a separate workflow. Google’s [OIDC documentation](https://developers.google.com/identity/openid-connect/openid-connect) describes the provider requirements.

## Stripe hosted checkout and payment return

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and an HTTPS `STRIPE_RETURN_URL`. Register:

```text
POST https://your-studio.example/integrations/stripe/<app-id>/webhook
```

Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`. Webhooks verify the signature against the raw request bytes and enforce a five-minute timestamp tolerance. Checkout creates immutable order items and integer-cent totals on the server, reserves stock atomically and uses idempotency keys. Duplicate confirmation does not create another notification or decrement stock twice. Order reads, cancellation and verification are scoped to the authenticated owner.

Both success and cancellation return to the configured app link with an order ID. The app ignores URL payment-status fields and asks the authenticated backend to verify the provider session, amount, currency and order metadata. A browser launch is always reported as pending, not successful payment. Unpaid cancellation expires a live session before releasing stock. Session expiry releases stock through the signed webhook, including when the original session-creation response was lost. Stripe requires webhooks for reliable fulfilment even if the customer never returns to the app; see [Stripe fulfilment](https://docs.stripe.com/checkout/fulfillment).

A `webView` widget supports exact `returnUrl`/`cancelUrl` matching, `onReturn`/`onCancel`/`onError`, loading progress and a bound return payload. Its return event must call the backend verification endpoint. JavaScript is an explicit host opt-in and host allowlists remain in force. Flutter web opens external content in the browser; the embedded webview is for supported native platforms. Use the system browser for Google authentication.

## App links and notifications

Instantiate `SpaceAppLinks` early, and configure `oauthReturnUri` and `paymentReturnUri` on the client. The handler accepts the exact configured scheme/host/port/path and fixed query parameters. It supports cold/warm links, persists the OAuth verifier across restarts and queues destinations until the Flutter host subscribes.

Android/iOS verified links require your domain association files and application identifiers. When using the `app_links` plugin, disable Flutter's built-in deep-link handler as documented in [Flutter deep linking](https://docs.flutter.dev/ui/navigation/deep-linking) and [app_links setup](https://pub.dev/packages/app_links).

The optional `packages/spacewidget_firebase` package uses Firebase Messaging 17 registration events. Initialize Firebase in the host first, construct `SpaceFirebasePush`, call `start()` early, and supply its `pushRegister`/`pushUnregister` operations to your client. Permission is requested only when the user enables notifications. Consent is persisted, tokens rotate and registrations follow the signed-in account; logout revokes the server's registration. Foreground notifications update `app.notifications.last`. Cold/warm notification taps use only an opaque notification ID and fetch an owned destination from the backend.

```dart
late SpaceFirebasePush push;
final client = SpaceClient(
  baseUrl: studioUrl,
  apiKey: publishableKey,
  oauthReturnUri: Uri.parse('https://app.example.com/auth-return'),
  paymentReturnUri: Uri.parse('https://app.example.com/payment-return'),
  operations: {
    'pushRegister': (request) => push.operations['pushRegister']!(request),
    'pushUnregister': (request) => push.operations['pushUnregister']!(request),
  },
);
final links = SpaceAppLinks(client: client);
push = SpaceFirebasePush(client: client, vapidKey: webVapidKey);
await push.start();
runApp(SpaceHostedApp.client(client: client));
// The owner disposes push, links and client when its application scope ends.
```

Set `FIREBASE_SERVICE_ACCOUNT_JSON` on the server. The sender uses FCM HTTP v1, encrypts device tokens, retries transient failures and removes unregistered devices. Delivery is at-least-once: clients should deduplicate notification IDs. Configure Firebase/APNs capabilities, Android permission, and a web messaging service worker/VAPID key for the target platforms. Background Dart handlers must be top-level entry points; they must not navigate UI. Firebase describes these platform requirements in [Flutter message handling](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages).

## What is verified and what needs a live environment

Automated tests exercise the actual Flutter customer journey against the local HTTP server: login, product sheet, cart, validated delivery form, simulated payment, orders, account tabs and notification navigation. Backend tests cover price tampering, idempotency, stock races, cancellation, ownership, signed Stripe webhooks, OAuth PKCE/replay protection, encrypted custom API connections, a real local PostgreSQL connector and FCM request/retry behavior. Adapter tests cover return-link matching, process-restart handoffs and cold notification navigation.

Provider protocol tests use injected sandbox responses, not live money, a real Google account or actual push delivery. Production release still needs your provider credentials, verified app links and device/browser tests of OAuth consent/cancellation, 3DS/redirect payment, webhook delivery/retry, push permission/rotation/taps and app process termination. Configure email delivery and persist/back up server data. The reference shop has one currency and a basic delivery address; shipping quotes/taxes, discounts, refunds/returns, inventory administration and fulfilment operations need your business backend or provider workflows before launching a real store. It is a tested implementation base, not a claim that every industry-specific production requirement is complete.

PDF widgets use the PDF.js version supported by [pdfx](https://pub.dev/packages/pdfx). Studio and the example include an external `space_pdf.js` loader; it downloads PDF.js only when a document opens, without inline scripts or delaying Flutter startup. A strict host CSP must permit the pinned PDF.js script/worker origin. A failed viewer provides an **Open PDF in browser** fallback. Other web hosts can copy this loader or supply their own PDF.js installation.
