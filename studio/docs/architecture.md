# Studio product structure

Studio is a designer-facing authoring application and a separately deployed runtime API. The Flutter SDK remains usable without Studio. Keep one server with explicit internal modules.

## Designer journey

1. Create an app and choose its theme.
2. Create screens and reusable components.
3. Configure shared bottom navigation once, with a destination screen for each item.
4. Define incoming screen parameters in Screen setup. Connect database or API content, mapping parameters and the signed-in user through pickers.
5. Configure interactions and When screen opens. Custom backend functions are reusable interaction steps; Dart extensions require a compiled host.
6. Preview with sample parameters/records, save, review and publish.

Navigation: Screens, Components, Content, Interactions, AI design, App settings. App settings owns Users, Integrations, Connect app, Custom code and Releases. API connections belong to Content; runtime keys belong to Connect app.

The layer inspector presents Appearance, Content and Interactions. Technical controls are an opt-in details panel, not a competing default workflow. Screen setup owns access, start screen, parameters, navigation and lifecycle.

## Boundaries

- `shared/`: browser-independent document operations and screen contract/composition. Server modules must not import `web/`.
- `web/`: designer features and presentation. Authoring state includes recovery, save status and conflict protection.
- `server/`: authoring, runtime delivery, identity, data connectors, external services and publication. Business examples must use explicit extension boundaries.
- `preview/`: Flutter editor host built from the same SDK source as the connected app. No production writes on the canvas; connected-app testing is explicit.
- Flutter core: parsing, rendering, themes, state and actions. Hosted sessions and device/provider integrations remain optional.

## Compatibility and release rules

Screen protocol remains version 1 with optional additive fields. Unsupported versions are rejected. Incoming parameters are declared, typed and validated before reading private or external data. They never establish identity or ownership.

Screen opening actions run once after the first successful render of a screen instance, not on every rebuild or refresh. Navigation creates a new instance. Failure uses the existing action error path. Preview editing must not execute opening actions automatically.

Published screens, theme, API endpoint definitions and enabled backend functions must resolve against an immutable release snapshot. Credentials are secret infrastructure settings and stay encrypted outside documents. Secret rotation is independent; structural API/function edits require a new release. Old releases without snapshots retain legacy behavior for compatibility.

Database upgrades use ordered, checksummed migrations under a transaction/advisory lock. Never silently rewrite an already-applied migration. Back up the Studio PostgreSQL schema before explicit reset; external connected databases are outside that reset.

## Validation

The repository validation command covers core Flutter, hosted adapters, Firebase, preview analysis, Studio unit/integration tests, web build, Flutter preview build and browser journeys. Real-provider/device qualification remains a release requirement; simulated provider responses do not prove live payment, OAuth or push delivery.

Acceptance journeys include: fresh setup; recover unsaved edits; create two screens; configure one shared navigation bar; pass a declared parameter to a filtered source; bind a field without JSON; run a backend function when opening a screen; handle action failure; publish; edit live dependencies; roll back; reject cross-app access.
