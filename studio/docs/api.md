# Hosted runtime API

All runtime calls use `X-Space-Api-Key: sw_pk_...`. A signed-in app user adds `Authorization: Bearer <accessToken>`. Secrets, database credentials, and builder cookies never belong in widget JSON. Responses are JSON with `success`; errors use their HTTP status and `{success:false,message,code}`. Runtime responses are marked `Cache-Control: no-store`.

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/runtime/start` | Initial published screen selected by the app key |
| GET | `/runtime/screens/:screenId` | Complete published screen and initial data |
| GET | `/runtime/data/:screenId/:queryId` | Subsequent data requests; accepts configured parameters and signed `cursor` |
| POST | `/runtime/actions/:actionId` | Validated user-owned insert/update/delete |
| POST | `/runtime/auth/register` | `name,email,password`; creates an app account and session |
| POST | `/runtime/auth/login` | `email,password`; creates a session |
| POST | `/runtime/auth/refresh` | `refreshToken`; rotates it and returns a fresh access token |
| GET | `/runtime/auth/me` | Verified current app user |
| POST | `/runtime/auth/logout` | Revokes current bearer session and/or submitted refresh token |
| POST | `/runtime/auth/password/request` | `email`; generic response whether that account exists or not |
| POST | `/runtime/auth/password/reset` | `email,code,password`; consumes code, revokes prior sessions, signs in |
| POST | `/runtime/auth/otp/request` | Signed-in user's email verification request |
| POST | `/runtime/auth/otp/verify` | `email,code`; consumes verification code and returns a session |

A screen response:

```json
{
  "success": true,
  "schemaVersion": 1,
  "screenId": "profile",
  "version": 1,
  "app": {"name": "Everyday"},
  "theme": {"seedColor": "#7763E8"},
  "state": {"user": {"name": "Sakthi"}},
  "widgets": {"type": "text", "text": "{{user.name}}"}
}
```

List data returns `{success:true,data:{items:[...],nextCursor:null}}`. A single-record source returns its object as `data`. Requests cannot choose arbitrary tables, columns, SQL, actions or applications; published definitions determine those resources. `APP_KEY_INVALID` means the key is missing/revoked/invalid. `AUTH_REQUIRED` means user authentication is required or invalid. The Flutter client distinguishes these so a bad app key does not masquerade as a login screen.

Auth success returns `{success:true,data:{accessToken,refreshToken,expiresAt,user}}`. `expiresAt` is Unix milliseconds. The SDK persists the tokens through its session store, exposes the user at `app.auth.user`, and sanitizes tokens from public operation results. `app.auth.signedIn` is display state; the server remains the authority for permission checks.

Builder APIs use a separate HttpOnly `sw_studio` cookie and an `X-CSRF-Token` from `/api/me` for mutations. Builder credentials never authorize a runtime app user's records. App ownership is checked for every app/resource route.

| Builder endpoint | Purpose |
| --- | --- |
| `GET/POST /api/setup`, `POST /api/login`, `GET /api/me`, `POST /api/logout` | First-owner setup and Studio sessions |
| `POST /api/invites`, `POST /api/register` | Owner-issued single-use invitations and builder registration |
| `GET/POST /api/apps`, `GET /api/apps/:appId` | App workspaces |
| `PUT /api/apps/:appId/draft` | `{revision,document}` with optimistic concurrency |
| `POST /api/apps/:appId/preview` | Expand an unpublished tree with sample state, without runtime publication |
| `GET/POST /api/apps/:appId/connections` | Safe connection metadata / encrypted PostgreSQL configuration |
| `GET /api/apps/:appId/connections/:connectionId/tables[/table]` | Introspection |
| `POST /api/apps/:appId/query-preview` | Evaluate a draft source; private previews require an app user ID |
| `GET/POST /api/apps/:appId/keys` | List masked keys / create a new key shown once |
| `POST /api/apps/:appId/keys/:keyId/rotate` or `/revoke` | Atomic rotation / revocation |
| `GET/POST /api/apps/:appId/releases` | Release list / validated publication with draft `revision` |
| `POST /api/apps/:appId/releases/:version/activate` | Select a prior release without changing the draft |
| `GET /api/apps/:appId/users`, `/outbox`, `/audit` | App user metadata, development email outbox, activity history |

The published document stores `screens`, `components`, `actions`, `initialScreen`, and `theme`. Each screen has `id,name,public,state,queries,tree`. Component instances use `{type:'component',componentId:'welcome-card',values:{title:'Hello'}}`; defaults and `{{props.title}}` are resolved before response delivery. No native Dart implementation is downloaded or executed by publishing JSON.


## Studio canvas preview

`POST /api/apps/:appId/preview` requires the builder session and CSRF token. It accepts `{document, screenId, componentId?, sampleState?}` and returns `{success, schemaVersion, screenId, componentId, theme, state, widgets, sourceMap}` without saving or publishing. `sourceMap` maps expanded widget IDs to authoring node/instance IDs and source component IDs; it is omitted from production runtime responses. Component expansion metadata never appears inside `widgets`.

The same-origin Flutter iframe uses a versioned message bridge: `spacewidget-preview-ready`, `spacewidget-preview` (document + revision + reset epoch), `spacewidget-preview-rendered`, `spacewidget-preview-geometry`, `spacewidget-preview-error`, and controls/scroll messages. Only matching origins and window sources are accepted. Outdated HTTP responses and geometry/render acknowledgements cannot replace the current revision. Run navigation uses correlated preview request/response messages to load draft screen JSON through the parent; it does not issue runtime service writes. `/flutter-preview/*` missing assets return 404 JSON rather than Studio's HTML fallback. Static Flutter assets use cache revalidation and do not consume API rate limits.

### Screen authoring additions (protocol 1)

A screen may declare `parameters: {productId: {type: "string", required: true, sampleValue: "p2"}}`, optional editor-only `previewData`, and an `onLoad` action or ordered action list. Runtime responses expose validated incoming values at `state.params` and include `onLoad`; Flutter executes it once per screen instance after its first render. Refresh does not replay it. Parameter types are string, number, integer and boolean. Required or malformed values fail before loading content. Legacy screens without declarations continue accepting their existing query parameters.

An app may set `navigation: {screenId: "main"}`. That screen's Scaffold owns one navigationBar/bottomNavigationBar. Each destination adds a distinct existing `screenId` and optional `query` values. Production and preview compose the same shared bar onto those destination screens, set its selected index, and generate replacement navigation. Screens outside the tab destinations retain their own layout. No access guard is bypassed.

App publication stores encrypted dependency snapshots for saved HTTP endpoint definitions and enabled backend JavaScript. Runtime API calls and functions resolve the active release's snapshot. Published preview uses the same API definitions; draft preview uses draft settings. Secrets remain server-only. Credential rotations for an unchanged API origin are independent of structural edits. Releases from before this feature retain legacy lookup behavior.

PostgreSQL schema changes use a separate ordered `schema_migrations` ledger with checksums. Database migration versions are independent of the screen protocol's schemaVersion.

Opening actions expand reusable components before runtime delivery. Draft preview accepts `overlayId` for an opening dialog/sheet content root on the selected screen; unknown roots are rejected. The returned `overlayId` identifies this isolated editing scope. Preview editing does not execute the opening event.

`GET /api/apps/:appId/push/destinations` returns the current published screen names, IDs and parameter declarations to the authenticated builder. Notification previews and sends validate incoming destination values against that release. Draft-only screens cannot be queued. Text, number and boolean parameters are accepted and normalized before storage.

The Flutter preview bridge forwards editor shortcuts with `spacewidget-preview-shortcut`. Parent handling verifies the frame and origin and accepts only the supported keys. Interactive text editing retains its local undo/delete behavior.
