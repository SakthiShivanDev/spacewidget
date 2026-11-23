# API-driven applications

SpaceWidget renders application UI from trusted JSON. The core has no HTTP or platform dependencies. `SpaceServices` connects a transport, named operations, live streams, and optional caches; `spacewidget_adapters` supplies concrete implementations.

## One response per screen

Start with `SpaceApp(config: {'initialSource': '/ui/home'}, services: services)`. The initial endpoint returns a complete screen:

```json
{
  "success": true,
  "schemaVersion": 1,
  "screenId": "catalog",
  "state": {"search": "", "products": [{"id": 1, "name": "Headphones"}]},
  "widgets": {
    "type": "scaffold",
    "appBar": {"type": "appBar", "title": "Shop"},
    "body": {
      "type": "paginatedList",
      "source": "/data/products",
      "initialItems": "{{products}}",
      "nextCursor": "page2",
      "template": {"type": "listTile", "title": "{{item.name}}"}
    }
  }
}
```

Rendering or rebuilding this screen does not fetch each widget separately. `initialItems` seeds pagination from the same response. `initialData` does the same for a `dataView`. Omitting these properties makes those explicit data widgets fetch on mount. Additional requests occur for load-more, search/filter changes, refresh, actions, and navigation; streams open their own connections. Network images, media, maps, PDFs, fonts, and SDK assets also load independently.

A screen may instead be a raw widget tree or a legacy `{success, widgets}` response. Non-scaffold roots are wrapped in a scaffold automatically. Schema version 1 is supported. `SpaceRemoteScreen` offers a custom loading builder, error builder and `SpaceScreenController` for refresh/status. It handles loading, retry, refresh failure with previous content, stale responses, and cancellation on disposal or supersession. The default request timeout is 30 seconds; timeout cancels the supplied token. Custom transports must honor cancellation to stop their actual I/O.

## Navigation and state

```json
{
  "type": "button",
  "text": "Open product",
  "action": {
    "type": "navigate",
    "source": "/ui/product",
    "query": {"id": 42},
    "arguments": {"origin": "catalog"},
    "refreshOnReturn": true
  }
}
```

This pushes a route and requests the destination endpoint once. `replace` replaces the current route. `pop` closes it. `refreshOnReturn` refetches the parent after the child is dismissed. `method`, `data`, `cacheSeconds`, and `offlineFallback` are optional navigation properties. Named routes can also map to endpoint descriptors:

```dart
config: {
  'initialRoute': '/',
  'state': {'user': {'name': 'Sakthi'}},
  'routes': {
    '/': {'source': '/ui/home'},
    '/profile': {'source': '/ui/profile', 'cacheSeconds': 30},
  },
}
```

Remote routes own local state. Use `{{name}}` for a local value and `{{app.user.name}}` for shared application state. `bind: 'app.cartCount'` writes shared state explicitly. Route metadata is available at `route.source` and `route.arguments`. Arguments remain local metadata; put values needed by the server in `query` or `data`. Server `state` is a shallow patch on refresh or successful action; nested objects replace their prior value. Returning to a mounted parent preserves its local state.

Bindings do not execute code. To display user-authored strings containing `{{...}}`, use `literal: true` on `text`, `selectableText`, or text slots such as a list tile title. Keep untrusted user content in data rather than treating it as a widget/action schema.

## Requests, forms, operations

```json
{
  "type": "form",
  "id": "booking",
  "children": [
    {"type": "input", "name": "patient", "required": true},
    {
      "type": "button",
      "text": "Book",
      "action": {
        "type": "submit",
        "form": "booking",
        "source": "/actions/appointment",
        "resultPath": "bookingResult",
        "onFailure": {"type": "snackbar", "message": "Please try again"}
      }
    }
  ]
}
```

Submission validates and sends saved form values as JSON with POST by default. Values override duplicate keys in action `data`. `request` defaults to GET and accepts `method`, `source`, `query`, `data`, `resultPath`, `onSuccess`, and `onFailure`. A response must have a boolean `success`:

```json
{
  "success": true,
  "data": {"reference": "VISIT-001"},
  "state": {"bookingStatus": "confirmed"},
  "actions": {"type": "snackbar", "message": "Booked"}
}
```

`resultPath` receives response `data` even on a business failure. Only successful results patch state, render optional returned `widgets`, and run server `actions` followed by `onSuccess`. Returned widgets replace the current remote screen; `presentation: 'dialog'` opens them in a dialog instead. `success: false` runs `onFailure` and stops the surrounding action sequence. Transport exceptions run `onFailure`, report through `onError`, and stop the sequence. User cancellation stops the sequence without `onFailure`. Buttons stay disabled during the pending action. Mutating requests are never automatically retried or queued offline.

Use `operation` with a registered `name` for host services. For example, `pickFiles` plus `resultPath: 'selection'` stores `{files: [...]}` locally; an `upload` operation can send `data: {files: '{{selection.files}}'}` to an endpoint as multipart. Files contain name, size, MIME type, and base64 bytes. Custom operations receive `SpaceRequest` and return `SpaceResult`. A form submit with `source` uses the JSON transport; call the upload operation explicitly when your endpoint requires multipart.

Additional state actions are `increment` (`path`, optional numeric `by`) and `append` (`path`, `value`); `refresh` refetches the current remote screen. Existing callbacks, named navigation, dialogs, bottom sheets, setters, toggles, and snackbars remain available.

## Data and live updates

`paginatedList` expects `{success: true, data: {items: [...], nextCursor: '...'}}`; null or omitted cursor ends pagination. It forwards the next cursor in `query.cursor`, supports a load-more button and scroll loading, pull-to-refresh, empty state, and retry. Changing resolved `source` or `query` resets the results and cancels the previous request. Search fields use `debounce` milliseconds, e.g. `{'type':'searchField','bind':'search','debounce':350}` with `query: {'q':'{{search}}'}`. Use `shrinkWrap: true` inside another bounded layout only for reasonably small datasets.

`dataView` renders a `template` with `{{data.field}}` from the response `data`. Both data widgets require a template widget object. Avoid collecting form fields through lazy lists if you need whole-form validation: only mounted fields participate.

```json
{
  "type": "live",
  "stream": "updates",
  "source": "/live/order",
  "bind": "order",
  "child": {"type": "text", "text": "{{order.status}}"}
}
```

A named stream factory receives source/query and yields JSON objects; each object replaces the bound snapshot. Streams unsubscribe on disposal or parameter changes. Failures expose reconnect UI; the host can supply authentication and a reconnection policy. This is snapshot transport, not durable messaging, push notifications, or delivery acknowledgements.

## Offline screens

Caching is off by default. `cacheSeconds` enables a bounded session memory cache when `SpaceServices.cache` is supplied. Explicit refresh bypasses it. `offlineFallback: true` plus a `SpaceDocumentStorage` implementation saves successful GET documents and can display a saved document after a failed load, with an offline banner and reconnect button. The persistent store has no expiry: the host decides which screens are eligible and clears them when required. It saves the server document rather than subsequent local edits.

`SpacePreferencesDocumentStore` is unencrypted and intended for public or explicitly cache-approved documents. Use account-specific namespaces, clear storage and memory cache on sign-out/account change, and supply encrypted storage if your domain requires it. Offline state is a display fallback; prices, availability, payments, bookings, prescriptions, permissions, and other transactions require current server validation.

## Application responsibilities

The package provides rendering and service boundaries. Authentication/session renewal, backend authorization, database transactions, inventory, payment verification/refunds, signed media access/DRM/casting/licensed downloads, secure teleconsultation, clinical workflows, notifications, analytics, deep links, and release/device qualification belong to the consuming application and its providers. It does not make an app production-ready solely by supplying its widgets. Localisation delegates, supported locales, locale, and restoration scope can be supplied to `SpaceApp`; backend strings and custom widgets still need localisation and accessibility review.

The demo covers commerce cart/checkout simulation, media resume, lesson/quiz completion, appointment conflict handling and documents, food customization/live order status, live messages, date-range travel reservations, and admin charts/tables. Its state is in memory, all sessions share it, payments are synthetic, and restarting the server resets it. Use it as an executable contract example.

## Repeated data in a grid

`repeat` supports `layout: "grid"` alongside its default list layout. Supply `crossAxisCount`, `crossAxisSpacing`, `mainAxisSpacing` and `childAspectRatio`; the same `items` binding and per-item `template` work in both layouts. `shrinkWrap` defaults to true for embedding in a scrolling screen. An optional `empty` widget renders when the list is empty. Studio's [Product grid](../studio/components/product-grid.json) composes this with responsive column counts and editable card properties.
