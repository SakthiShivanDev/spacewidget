# Changelog

## Unreleased

- Designer Studio workflows: Content, Interactions and grouped app settings; screen parameters, shared bottom navigation and opening events.
- Automatic draft saving and local recovery, generic notification delivery, checksummed PostgreSQL migrations and immutable API/function release dependencies.
- Shared authoring contract, extracted feature/runtime modules, JavaScript lint, cross-package CI and preview/source build verification.
- Guided database operation inputs/forms, editable opening overlays, safe nested-component extraction, paired tabs, API test inputs and sign-in destination setup.
- Preserve OAuth destinations across process restart, validate published notification parameters, and forward Studio shortcuts from the Flutter preview frame.

## Studio / adapters 0.3.0 (unreleased)

* Require PostgreSQL for Studio, managed app data, sessions and commerce; add verified, transactional SQLite import with backups and preserve existing encryption keys.
* Add encrypted per-builder OpenAI/Gemini/Claude design proposals, reviewed draft application and editable generated layer identities.
* Add Apple OAuth with one-use state/nonce and PKCE app handoffs, Razorpay hosted checkout with signed webhooks, general push destinations/inboxes and approved external app links.
* Add saved API endpoint testing and credential-preserving updates, isolated backend JavaScript modules with explicit version activation, and compiled Dart custom-widget exports with typed binding helpers.

* Add a designer inspector with Design/Data/Actions/Advanced tabs, compact typography and spacing controls, readable filter labels, guided data-source setup, repeated list/grid creation and current-item field connections.
* Add read-only published-release comparison, explicit sample/database preview modes, unsaved query previews and shared Flutter theme construction. Show draft and published versions separately and preserve unsaved edits when switching preview sources.
* Correct designer color swatches for Flutter named/ARGB colors and retain explicit alpha when changing a color.

* Add reviewed Figma imports with an offline companion plugin, editable positioned layers, PNG snapshots, screen/component destinations and undo. Include embedded raster image support in the Flutter renderer.

* Replace Studio's browser approximation with one Flutter canvas for editing and interactive draft navigation, with source selection, geometry overlays, constrained resizing, device sizes, zoom/pan and preserved input state.
* Add searchable context-aware widget/component insertion, collapsible/resizable panels, draggable layers, typed component overrides and preview diagnostics. Fix preview asset fallback, static asset rate limiting and stale update races.
* Add optional `SpaceWidget.onNodeBuilt` observation for editor tooling without introducing render objects or changing Flutter parent-data constraints.

* Add the reusable responsive Product grid component and grid layouts/empty slots for data-bound repeats.

* Add typed customization controls for the complete Studio widget catalog, form field/collection editors, legacy property editing and native layout defaults.
* Add a separately deployable visual screen/component editor with a Node 24 API server, PostgreSQL control plane and PostgreSQL data connectors.
* Add selected-field queries, verified user ownership filters, parameterized actions, immutable releases, rollback and hashed app keys with rotation/revocation.
* Add builder invitation/setup flows and runtime email/password authentication, rotating sessions, password reset and email verification.
* Add `SpaceClient`, `SpaceHostedApp`, secure session storage and six authentication widget builders in the optional adapters package.
* Add the hosted Flutter example, actual Flutter editor preview, deployment configuration and API documentation. The Flutter-only core remains at 0.2.0.

## 0.2.0

* Expand to 120 built-in type names, including advanced forms, slivers, galleries, quantity controls, charts, timelines, countdowns, and data/loading states.
* Add complete API screen loading, endpoint navigation, isolated screen/shared app state, request/operation results, cancellation, retry, refresh, opt-in memory cache and offline storage.
* Add seeded cursor pagination, query-driven data templates, live snapshots, and sortable/selectable/paginated tables.
* Add optional Dio, WebSocket, video/audio, file/camera, map, PDF, web-view, hosted-checkout handoff and preferences-storage adapters.
* Add a local API server and eight industry workflow examples with regression tests.
* Fix malformed field configuration reporting, choice membership validation, live overlay bindings, active config updates, and media resume initialization.

## 0.1.0

* Initial JSON-driven Flutter package with 93 built-in widget type names, including aliases.
* Immutable widget models and controller snapshots, typed bindings and nested state.
* Material application routes, light/dark themes, responsive branches and repeating data templates.
* Scoped forms with persistent keys, validation, typed choices and validated submission callbacks.
* Host action/widget registries, sequential actions, overlays and located error reporting.
* Runnable JSON dashboard example and parser, state, widget and application tests.

### Studio interactions and commerce reference

- Guided sheet/dialog, close-result, tab, navigation, form/integration and API action editors, including ordered actions and response presentation.
- Navigation selection without an explicit binding; scoped selection events; tab swipe/binding synchronization and switch-tab actions; observable overlays with safe area/keyboard handling.
- Commerce template and connected demo with user carts, immutable server-priced orders, atomic stock reservations, idempotent checkout, Stripe verification/webhooks and a notification inbox.
- Google OIDC with PKCE/nonce/state and one-use return exchange; strict app-link handling; WebView return/cancel/error events; optional Firebase Messaging registration and notification navigation.
- Encrypted HTTP service connections, single-response API screen sources and a PostgreSQL connection sourced from APP_DATABASE_URL.
