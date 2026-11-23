# Studio platform setup

Studio now requires PostgreSQL for accounts, sessions, screens, managed app tables, saved credentials, commerce and notifications. The Flutter runtime remains a separate package. Existing local apps were imported using a read-only SQLite migration with per-table checksums; the server has no SQLite dependency.

## Database

Set `STUDIO_DATABASE_URL` (fallback `DATABASE_URL`) and preserve the original `STUDIO_MASTER_KEY`. `STUDIO_DATABASE_SCHEMA` defaults to `spacewidget`. Remote databases use verified TLS by default; optional `STUDIO_DATABASE_CA` supplies a private CA. `STUDIO_DATABASE_TLS=false` is intended for local development; production rejects insecure remote connections. The Studio role needs schema/table creation rights. External app-data connections use their own restricted roles and approved `STUDIO_DB_HOSTS`.

For a fresh local development installation with PostgreSQL 16 binaries, `npm run configure`, then `npm run db:local`. The latter saves private credentials in `.env` and starts a loopback-only PostgreSQL cluster under `studio/data/postgres`. Start an existing local cluster with `/usr/lib/postgresql/16/bin/pg_ctl -D data/postgres -l data/postgres/server.log start`; stop it with `pg_ctl -D data/postgres stop`. The helper does not replace an already configured URL.

For an old installation: stop Studio, set an empty PostgreSQL target and run `npm run db:import-sqlite -- data/studio.sqlite`. The utility creates a consistent backup, imports in one transaction and compares row counts and checksums. It refuses a nonempty target; keep its backup/report and the original encryption key. Remove `STUDIO_DB` after success. Back up production PostgreSQL using `pg_dump` or your provider’s backup service.

## API data and external apps

In **API services**, save an HTTPS origin approved by `STUDIO_HTTP_HOSTS`, credential headers and named endpoints. Select an app user to test private GET requests, inspect the response and connect it to a screen. Bind `{{productsApi.name}}` for a record, or repeat `{{productsApi.items}}` for an API returning `{items:[...]}`. The response’s actual structure determines the binding. Screen startup combines configured GET sources into one JSON response.

Private endpoint requests add authenticated `X-Space-User-ID` and `X-Space-App-ID` server-side; external APIs must authenticate Studio’s configured server credential and enforce ownership using those trusted headers. Do not trust IDs in arbitrary request bodies. Public endpoints allow only GET. Credentials stay encrypted and do not appear in runtime JSON. Redirects are rejected and responses are capped at 1 MB. Saved headers are retained when an update omits them; sending a headers object replaces them.

Use the widget Action inspector’s API request for mutations at `/runtime/http/<service>/<endpoint>`. Select the configured method; successful responses can update state or navigate. Builder POST tests require `confirm:true` because they can change the external system.

In **Integrations → External apps**, save a named destination. An integration action `openExternalApp` with data `{name:"Support"}` resolves only that saved destination. HTTPS links use the host’s optional web-host allowlist. Email/telephone links are allowed by default; other schemes also require `SpacePlatform(allowedAppSchemes:{'whatsapp', ...})` and the platform’s URL-scheme configuration. Arbitrary downloaded JSON cannot enable executable schemes such as `javascript:` or `file:`. These links are distinct from authenticated server-to-server API connectors.

## AI screen and component design

In **AI design**, select OpenAI, Gemini or Claude, enter a model ID available to your provider account with structured JSON output support, and save your own API key. Each Studio builder owns their encrypted credentials. The server never returns saved key values. Blank keys preserve saved values; Remove key deletes them. No platform-owned shared AI key is required.

Describe a new screen/component, generate, review the widget structure, and Apply it to the draft. Apply adds a new entity, supports Undo, and does not publish. Database records, connector secrets, customer sessions and existing code are excluded from the provider prompt. The selected provider receives your prompt, widget catalog and app theme and bills your account. Generated nodes are schema-checked; event actions and external resources are rejected, so wire application behavior after design review. Provider errors do not echo credentials. Model refusals, incomplete generation and malformed output leave the draft unchanged. Actual visual quality depends on the selected model and prompt.

Requests use [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output), or [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs). No live provider credentials were available in the development environment; automated tests use mocked provider responses.

## Google and Apple sign-in

Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL=https://studio.example.com/integrations/google/callback`.

Apple: `APPLE_CLIENT_ID` (web Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (PKCS#8 P-256 key, PEM with newlines or escaped `\n`), `APPLE_CALLBACK_URL=https://studio.example.com/integrations/apple/callback`. Apple sends a `form_post` callback. Register the domain and exact redirect URL in Apple Developer. See [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens).

Both require `SPACE_AUTH_RETURN_URLS`, a comma-separated exact allowlist of app return destinations. Configure `SpaceClient(oauthReturnUri: ...)` and platform app links in the Flutter host. Use `authOAuth` (Google by default, or `{provider:"apple"}`) or `authApple` in a widget integration action. Built-in sign-in forms show configured providers. `startOAuthSignIn(provider:'apple')` is also available directly.

State and nonce are validated, callback claims are one-use, and a short-lived handoff code is exchanged using an app-held PKCE verifier persisted across restart. Credentials never travel in redirect query strings. A provider identity is app-scoped; matching an existing email does not automatically link/take over its account. Authenticated account linking is not implemented. Development tests cover protocol handling with provider responses mocked; real Google/Apple consoles, domain verification and device return links still need deployment validation.

## Stripe and Razorpay

Choose `PAYMENT_PROVIDER=stripe` or `razorpay` and `PAYMENT_CURRENCY=usd` or `inr` **before** adding products. Other supported two-decimal store currencies are EUR, GBP, AUD, CAD and SGD; your provider account must support the selected currency. Prices are stored as integer minor units, with no automatic currency conversion. Changing this setting reinterprets product prices, so plan any currency migration explicitly. Existing orders keep their original currency and server-priced snapshot.

Stripe needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_RETURN_URL` (HTTPS app link), and a webhook at `/integrations/stripe/<app-id>/webhook` for checkout completion, async success and expiration. Razorpay needs `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_RETURN_URL` (HTTPS app link), and a webhook at `/integrations/razorpay/<app-id>/webhook` for `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`. Configure the exact provider webhook on the provider dashboard.

The default checkout uses your selected provider; trusted pricing always comes from stored products. A checkout request can explicitly choose either configured provider. Razorpay uses [hosted Payment Links](https://razorpay.com/docs/api/payments/payment-links/create-standard), unique order references and recovery of an existing link after an ambiguous create. Partial payments are disabled. Webhooks verify the raw-body HMAC, immutable order metadata, amount, currency and link identity, and deduplicate event IDs. Payment returns never trust URL status flags: the authenticated app fetches provider status through the server before marking an order paid. Configure `SpaceClient(paymentReturnUri:...)` for either provider.

Reserve/checkout/cancel flows are tested against mocked providers. Provider outages or ambiguous payment creation retain reservations until reconciled; operations should monitor pending orders and handle support/refunds. Refund automation, tax, shipping, subscriptions and fulfillment integrations are outside the reference checkout. Local `SPACE_DEMO_PAYMENTS=true` enables simulated checkout only outside production; production cannot enable it from a request.

## Firebase push

Set server-only `FIREBASE_SERVICE_ACCOUNT_JSON`. Add the optional `spacewidget_firebase` package to the Flutter host, initialize Firebase, configure Android/iOS/web messaging and permissions, then attach its push coordinator. Web push needs the host’s Firebase messaging service worker and VAPID configuration; iOS needs APNs setup.

**Integrations → Send a notification** previews a message to one registered app user and a published screen. Confirm Send to queue it. General notifications do not require an order; commerce confirmations continue to create order notifications. `GET /runtime/push/notifications` lists the current user’s latest 100 messages and works for non-commerce apps too. Use it as a Data View source. Notification taps should request `/runtime/push/notifications/{{item.id}}` and navigate to the returned `screenId` and `query`; fresh commerce templates use this flow. Older custom notification lists that navigate directly to an order need this action update to support non-order messages. The sender polls every 30 seconds, retries transient failures with backoff, removes unregistered tokens and excludes revoked/expired sessions. Push payloads contain an opaque notification ID; the authenticated app resolves the destination with ownership checked again. Logout revokes device/session bindings. Missing Firebase credentials leave in-app notifications available but do not deliver external push. Live delivery still requires provider/device configuration.

## Custom code

**Custom code → Backend JavaScript** accepts a synchronous `(context) => JSON` function. `context.input` is the request body; `context.user` comes from the authenticated server, never the body; `context.app.id` identifies the current app. Test, save, then explicitly Enable a saved version. Runtime callers use `POST /runtime/functions/<module-id>` and must sign in. Draft edits do not alter enabled code. Enabling prepares a version for the next app publication. Screen releases capture enabled function sources and API definitions, so an app rollback also restores them. Credentials stay encrypted; rotations for the same API origin can apply independently. Older releases created before dependency snapshots retain their legacy behavior. Revision checks reject stale saves.

Code runs in QuickJS inside a worker with no host API bridge, environment, filesystem, Node modules or network. It has a 16 MB heap, 500 ms execution deadline and a separate wall-clock termination timeout. Results are limited to 256 KB; inputs to 128 KB. Async handlers are unsupported. Use guided owned database actions and saved HTTP services for I/O. This is a bounded transform/calculation extension, not arbitrary server administration.

**Custom code → Flutter host (Dart)** stores and exports Dart source. Compile it into your app and register a named builder:

```dart
Widget greeting(SpaceBuildContext space) {
  final data = space.read('data', {}) as Map;
  return Text('Hello ${data['name'] ?? 'friend'}');
}

SpaceWidget(
  widgets: spaceCustomWidgets({'greeting': greeting}),
  data: {
    'type': 'customWidget',
    'name': 'greeting',
    'data': {'name': '{{user.name}}'},
  },
);
```

`SpaceBuildContext.read` resolves typed bindings like built-in widgets. Pass custom builders into each `SpaceWidget`, or supply `SpaceClient(widgets: spaceCustomWidgets({...}))` when using `SpaceHostedApp.client`. Add a Custom Widget layer and choose the registered name. Native Flutter cannot interpret downloaded Dart; modifying Dart requires rebuilding your host. To preview it visually in Studio, register the same builder in `studio/preview/lib/main.dart` and rebuild the preview. An absent builder displays a clear setup placeholder. Downloaded Dart is never executed by Studio.

## Verification limits

Server tests use real temporary PostgreSQL clusters. They exercise auth, data ownership, API host/method/identity restrictions, code isolation/timeouts, structured AI responses, OAuth handoffs and signed payment events. Browser tests exercise Studio controls and Flutter preview interactions. Provider protocol tests use mocks; they do not establish that a production provider account, remote database deployment or physical-device integration has been configured. Configure the environment and complete real sandbox/device validation before accepting live traffic.
