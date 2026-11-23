# SpaceWidget

Build Flutter screens and Material apps from JSON. SpaceWidget includes **120 built-in type names (including aliases)**, shared state, validated forms, named routes, light/dark themes, responsive layouts, data templates, and custom widget/action registries.

The core depends only on Flutter. Complete screens load from one API response, and navigation can fetch each destination from its own endpoint. Optional adapters add HTTP, WebSocket updates, media playback, maps, files/camera, PDFs, web views, hosted checkout, and offline screen storage.

Start with the [API-driven app guide](docs/remote-apps.md), [adapter setup](packages/spacewidget_adapters/README.md), and [eight-workspace demo](example/README.md). These provide application building blocks and executable workflows; real production releases still require domain backends, provider setup, and device validation.

## Self-hosted visual builder

[SpaceWidget Studio](studio/README.md) is a separate browser editor and API server. Create screens and reusable components, connect PostgreSQL tables, configure selected fields and user-scoped filters, and publish versioned screen APIs. The Flutter app connects using a server origin and publishable app key:

```dart
runApp(const SpaceHostedApp(
  baseUrl: 'https://studio.example.com',
  apiKey: 'YOUR_PUBLISHABLE_RUNTIME_KEY',
));
```

Import `package:spacewidget_adapters/spacewidget_adapters.dart` for `SpaceHostedApp`. The companion handles authenticated sessions and provides login, signup, password-reset and email-verification widgets. App keys identify applications; private records require a separate user session. Studio includes Node 24 setup, database/action editors, API-key rotation, release rollback and Docker/Caddy deployment configuration. See the [Studio designer guide](studio/docs/designer-guide.md), [architecture](studio/docs/architecture.md), and [hosted example](example/README.md#hosted-studio-app) and [API contract](studio/docs/api.md).

## Requirements

Flutter 3.47+ and Dart 3.13+. Verified with Flutter 3.47.6 / Dart 3.13.5. This is an initial package implementation; it has not been published to pub.dev.

## Render a screen

Add a local dependency while developing:

```yaml
dependencies:
  spacewidget:
    path: ../spacewidget
```

```dart
import 'package:flutter/material.dart';
import 'package:spacewidget/spacewidget.dart';

void main() => runApp(MaterialApp(
  home: SpaceWidget(data: {
    'type': 'scaffold',
    'appBar': {'type': 'appBar', 'title': 'Hello SpaceWidget'},
    'body': {
      'type': 'center',
      'child': {'type': 'text', 'text': 'Built from JSON', 'fontSize': 24},
    },
  }),
));
```

`SpaceNode.fromJson(data)` creates an immutable parsed tree; render it with `SpaceWidget.node(node: node)`. A `SpaceWidget` belongs below a Material app. Use `SpaceApp` when JSON should also describe the application and routes.

## Describe an app

```dart
runApp(SpaceApp(
  config: {
    'schemaVersion': 1,
    'title': 'My app',
    'initialRoute': '/',
    'theme': {'seedColor': '#4F46E5'},
    'themeMode': 'system',
    'state': {'user': {'name': 'Sakthi'}},
    'routes': {
      '/': {
        'type': 'scaffold',
        'body': {
          'type': 'center',
          'child': {
            'type': 'button',
            'text': 'Hello {{user.name}}',
            'action': {'type': 'navigate', 'route': '/profile'},
          },
        },
      },
      '/profile': {
        'type': 'scaffold',
        'appBar': {'type': 'appBar', 'title': 'Profile'},
        'body': {'type': 'text', 'text': '{{user.name}}'},
      },
    },
  },
));
```

Schema version 1 is supported. `theme` and `darkTheme` support `seedColor`, exact `primaryColor`/`secondaryColor`, `surfaceColor`/`errorColor`, their `on…Color` text colors, `backgroundColor`, `fontFamily`, `fontSize`, and `borderRadius`. Uploaded TTF/OTF files in `theme.fonts` load in both Studio and the hosted app. Dark appearance generates its own colors unless overridden by `darkTheme`. Color properties can reference app roles such as `@theme.primary` or `@theme.surface`; explicit widget colors take priority. `SpaceApp` owns its controller unless one is supplied. Config updates preserve current state; call `controller.reset()` explicitly to replace state. Named navigation is intended for app screens; browser URL synchronization and deep-link parsing can be integrated by embedding `SpaceWidget` under your router.

## JSON conventions

- Every node has a `type`, optional stable `id`, `child`, and/or `children`.
- Properties may be top-level or inside `props`. Precedence is `style` → top-level → `props`.
- Connet's `widgetType`, `style`, `mainAxis`, `crossAxis`, and option `lable` spellings are accepted. The package uses a new action API; legacy `/custom` + `pageSrc` navigation is supported; app-specific `function` objects still need host adapters.
- Slots such as `body`, `appBar`, `title`, `leading`, and `trailing` accept widget objects. Text strings are also accepted in slots. `actions` accepts a list of widget objects.
- Insets accept a number or `{ "horizontal": 16, "vertical": 8 }` or individual `top`, `right`, `bottom`, `left` values.
- Colors accept `#RGB`, `#RRGGBB`, `#AARRGGBB`, hex without `#`, integer ARGB, or names in `parseSpaceColor`.
- Unknown types and invalid node properties report `SpaceIssue` through `onError` and render an error placeholder. Supply `errorBuilder` to control that placeholder. Structural widget parsing and rendering have a depth limit of 64. Invalid application configuration fails with `FormatException`.
- Flutter layout rules apply: `expanded` and `flexible` need a row/column, `positioned` needs a stack, tabs need `defaultTabController`, and scrolling widgets need bounded space or `shrinkWrap`. Avoid duplicate IDs among siblings. Form IDs must be unique within a renderer, and each form field needs a unique name within its form.

## State and bindings

```dart
final controller = SpaceController(initialState: {
  'name': 'Sakthi', 'showDetails': true,
});

// Pass controller to SpaceWidget or SpaceApp.
controller.setValue('name', 'Space builder');
controller.setValue('user.preferences.notifications', true);
```

`"Welcome {{name}}"` interpolates strings. An exact `"{{showDetails}}"` preserves the boolean type; exact bindings also preserve numbers, lists, maps, and null. Bindings read dot-separated map keys. They do not evaluate Dart, arithmetic, arbitrary expressions, or list indexes.

Interactive controls use `bind` (or `name` for form fields). `onChanged` runs after updating bound state. Controller snapshots are immutable, and supplied controllers remain owned by the caller: dispose them when their owning application component is disposed.

Use `conditional` with boolean `condition` and widget slots `then` / `else`. Use `responsive` with `small`, `medium`, `large`; defaults switch at 600 and 1024 logical pixels. The small branch is the fallback for an omitted larger branch.

```json
{
  "type": "repeat",
  "items": "{{projects}}",
  "template": {
    "type": "listTile",
    "title": "{{item.name}}",
    "subtitle": "Project {{index}}"
  }
}
```

Repeat templates support `{{item}}`, `{{item.field}}`, and `{{index}}` alongside global bindings. Repeats shrink-wrap without their own scrolling by default; use `shrinkWrap: false` for a bounded scrolling list. Supply item-specific stable IDs in templates when preserving identity across reordering matters.

## Forms

```json
{
  "type": "form",
  "id": "profile",
  "children": [
    {"type": "input", "name": "name", "label": "Name", "required": true},
    {"type": "input", "name": "email", "label": "Email", "email": true},
    {
      "type": "dropdown",
      "name": "role",
      "options": [{"label": "Developer", "value": "dev"}]
    },
    {
      "type": "button",
      "text": "Save",
      "action": {"type": "submit", "form": "profile", "name": "saveProfile"}
    }
  ]
}
```

Register `actions: {'saveProfile': (event) async { /* event.values */ }}`. Submission validates before calling the handler. `form` may be omitted when the submit button is inside the target form. Form keys persist across rebuilds and are scoped to each renderer, including overlays. Form content is a column by default; place it in a scrolling parent when needed. Lazy scrolling forms only validate currently mounted fields; use a non-lazy form column for whole-form validation.

Controls: `input` / `textField`, `textArea`, `searchField` (debounce), `autocomplete`, `dropdown`, `radio`, `multiSelect`, `checkbox`, `switch`, `slider`, `rangeSlider`, `rating`, `datePicker`, `dateRangePicker`, `timePicker`. Options retain typed values. Dates are `YYYY-MM-DD`; times are 24-hour `HH:mm`.

Validation: `required`, `requiredMessage`, `minLength`, `maxLength`, `email`, `pattern`, `patternMessage`, and numeric `min` / `max`. Required switches and checkboxes must be true. Field configuration includes `initialValue`, `enabled`, `readOnly`, `hint`, `helperText`, `obscureText`, `keyboardType`, `minLines`, `maxLines`, and `onChanged` where applicable.

## Actions and integrations

An action can be a handler name, an object, or a sequential list of actions. A failed action or invalid form stops the sequence. Register handlers by name through `actions`, or use `onAction` as the fallback. Handlers receive context, controller, node, resolved action properties, and validated form values. Buttons disable themselves while an asynchronous handler is pending.

| Action type | Properties |
| --- | --- |
| `callback` | `name`, plus your own parameters |
| `submit` | `name`, optional `form` |
| `set` | `path`, `value` |
| `toggle` | boolean state `path` |
| `navigate`, `replace` | `route` or API `source`, optional `query`, `data`, `arguments`, `refreshOnReturn` |
| `request`, `operation` | `source` / registered `name`, `method`, `data`, `resultPath`, `onSuccess`, `onFailure` |
| `refresh`, `increment`, `append` | current remote screen; numeric `path`/`by`; list `path`/`value` |
| `pop` | optional `result` |
| `snackbar` | `message` |
| `dialog`, `bottomSheet` | `content` widget object |

Navigation and overlays await dismissal before the next action in a sequence. `replace` starts replacement immediately. Host action failures go to `onError`; without it they are reported through Flutter's error handler. Backend work is explicit Dart code, so applications can choose their own HTTP client, authentication, caching, and request policy.

```dart
SpaceWidget(
  data: pageJson,
  actions: {
    'saveProfile': (event) async {
      await repository.saveProfile(event.values);
      if (!event.context.mounted) return;
      ScaffoldMessenger.of(event.context).showSnackBar(
        const SnackBar(content: Text('Saved')),
      );
    },
  },
  widgets: {
    'brandCard': (context) => Card(
      child: context.build(context.node.child!),
    ),
  },
)
```

Custom builders can override built-ins and receive `node`, `controller`, actual Flutter `context`, `build(childNode)`, and `dispatch(action)`. This is the extension point for maps, charts, cached images, file uploads, media, and platform-specific widgets.

## Widget catalog

| Category | Built-in type names |
| --- | --- |
| App structure | `scaffold`, `appBar`, `drawer`, `navigationBar`, `bottomNavigationBar` (Material 3 navigation bar alias), `navigationRail`, `defaultTabController`, `tabBar`, `tabBarView`, `tab` |
| Layout | `safeArea`, `container`, `padding`, `center`, `align`, `sizedBox`, `sizedBoxFill`, `row`, `column`, `stack`, `positioned`, `expanded`, `flexible`, `spacer`, `wrap`, `aspectRatio`, `constrainedBox`, `fractionallySizedBox`, `clipRRect`, `clipOval`, `fittedBox` |
| Scrolling and data | `listView`, `gridView`, `singleChildScrollView`, `pageView`, `repeat`, `dataTable`, `stepper`, `refreshIndicator` |
| Content | `text`, `selectableText`, `richText`, `textSpan`, `icon`, `image`, `circleAvatar`, `card`, `listTile`, `expansionTile`, `divider`, `verticalDivider`, `chip`, `actionChip`, `badge`, `tooltip` |
| Interaction | `button`, `elevatedButton`, `filledButton`, `outlinedButton`, `textButton`, `iconButton`, `floatingActionButton`, `gestureDetector`, `inkWell`, `canPop` |
| Forms | `form`, `input`, `textField`, `textArea`, `dropdown`, `checkbox`, `switch`, `radio`, `slider`, `datePicker`, `timePicker` |
| Advanced layouts | `customScrollView`, `sliverAppBar`, `sliverList`, `sliverGrid`, `sliverPadding`, `sliverToBoxAdapter`, `sliverFillRemaining`, `stickyHeader`, `nestedScrollView`, `draggableScrollableSheet` |
| App workflows | `quantitySelector`, `imageGallery`, `timeline`, `countdown`, `chart`, `paginatedList`, `dataView`, `live`, `emptyState`, `errorState`, `skeleton` |
| Advanced forms | `searchField`, `autocomplete`, `multiSelect`, `rangeSlider`, `rating`, `dateRangePicker` |
| Feedback and overlays | `loader`, `circularProgressIndicator`, `linearProgressIndicator`, `alertDialog`, `bottomSheet` |
| Dynamic behavior | `visibility`, `conditional`, `responsive`, `opacity`, `animatedOpacity`, `animatedContainer`, `animatedSwitcher`, `transform`, `ignorePointer`, `absorbPointer`, `semantics`, `theme` |

Important properties:

| Widgets | Properties |
| --- | --- |
| Scaffold | slots: `appBar`, `body` (or `child`), `drawer`, `endDrawer`, `bottomNavigationBar`, `floatingActionButton`, `bottomSheet`; `backgroundColor`, `extendBody`, `resizeToAvoidBottomInset` |
| App bar | `title`, `leading`, `actions`, `bottom`, `bottomHeight`, `centerTitle`, `automaticallyImplyLeading`, colors, `elevation` |
| Navigation | `destinations: [{icon, selectedIcon, label, action}]`, `selectedIndex` or state `bind`, `onChanged`; rail: `extended` |
| Tabs | controller: `length`, `initialIndex`, `child`; bar: `children`, `isScrollable`, `bind`, `onChanged`; view: matching `children`; tab: `text` or `child`, optional `icon` |
| Container/card | dimensions, `padding`, `margin`, `backgroundColor`, `borderRadius`, `elevation`; container: `border`, `borderColor`, `borderWidth`, `alignment` |
| Row/column | `children`, `mainAxisAlignment`, `crossAxisAlignment`, `mainAxisSize`, `spacing`; wrap: `direction`, `spacing`, `runSpacing` |
| Stack/positioned | `alignment`, `clip`, `children`; positioned: `top`, `left`, `right`, `bottom`, `width`, `height` |
| Flex/sizing | `flex`; `width`, `height`; `aspectRatio`; `minWidth`, `maxWidth`, `minHeight`, `maxHeight`; `widthFactor`, `heightFactor` as appropriate |
| Lists/grids | `children`, `padding`, `shrinkWrap`, `primary`, `scrollable`; list: `direction`, `itemExtent`; grid: `crossAxisCount`, `crossAxisSpacing`, `mainAxisSpacing`, `childAspectRatio` |
| Text | `text`, `fontSize`, `fontWeight` (100–900), `color`, `fontFamily`, `italic`, `letterSpacing`, `lineHeight`, `decoration`, `textAlign`; text: `maxLines`; rich text: styled text `children` |
| Icons/images | icon: named `name`, `size`, `color`, `semanticLabel`; image: `src`, `source: network/asset`, optional asset `package`, dimensions, `fit`, `error` slot |
| Buttons | `text`/`label` or `child`, `action`/`onPressed`, `enabled`, colors, padding, border radius; icon buttons: named `icon`, `tooltip` |
| List tile | `title`, `subtitle`, `leading`, `trailing`, `icon`, `selected`, `enabled`, `onTap` |
| Progress | optional `value` (omit for indeterminate), `color`; circular: `strokeWidth`; linear: `height`, `backgroundColor` |
| Table/stepper | table: string or `{key,label,numeric}` `columns`, cell-list or keyed-map `rows`, `sortable`, `selectable`, `bind`, `rowKey`, `pageSize`; stepper: `steps: [{title, content}]`, state `bind`, `selectedIndex`, `onChanged`, `onComplete`, `direction` |
| Animation | `duration` in milliseconds, plus opacity/container properties; switcher: stable distinct child `id`s; transform: rotation `angle` in radians, `scale` |

Supported icon names are exported in `spaceIcons`; custom icon systems can use a registered widget builder. Asset images and custom fonts must be declared by the consuming app. `image.src` also accepts base64 PNG, JPEG, WebP and GIF data URIs (up to 8 MB decoded); these render from memory on web and native platforms. Studio’s Figma importer uses embedded PNG assets. Include `uses-material-design: true` in the application’s `flutter` pubspec section for Material icons. Image caching beyond Flutter's image cache can be supplied through an image builder override.

## Extended widget properties

Sliver widgets belong in `customScrollView.children`; use `sliverToBoxAdapter` around box content. Sticky headers use `child`, `minHeight`, and `maxHeight`. `nestedScrollView` takes slivers in `headers` and a `child` body; `draggableScrollableSheet` scrolls its `child` using its attached controller.

`quantitySelector` uses integer `bind`, `min`, and `max`. `rangeSlider` binds `[start,end]`; `dateRangePicker` binds `{start: YYYY-MM-DD, end: YYYY-MM-DD}`. `multiSelect` binds a list of typed option values. `rating` uses `max` and a numeric binding. `imageGallery` takes `images` URLs and supports pinch zoom. `timeline` takes `items` with title/subtitle; `countdown` takes an ISO `endsAt` and optional `onComplete`; `chart` takes numeric `values` and `kind: bar/line`. Charts are basic display widgets; replace their builder for advanced analytics.

See the [remote guide](docs/remote-apps.md) for pagination, data templates, live snapshots, API submissions, screen state, and caching contracts.

## Run the example

The demo includes a dashboard, dynamic project list, profile form, navigation, theming, a modal, and a custom status widget. All screens live in `example/assets/app.json`.

```sh
cd example
flutter pub get
flutter run -d chrome
```

The checked-in runner targets web. To run on another Flutter platform, add its runner with `flutter create --platforms=android,ios,macos,windows,linux .` in `example`, selecting the platforms your host supports.

## Development

```sh
flutter pub get
flutter analyze
flutter test
cd example
flutter test
flutter build web --release
```

Tests cover state and parsing, widget construction/layout across the catalog, form validation and persistence, selection controls, custom builders, route sharing, dialogs, responsive behavior, async submission, and the demo's navigation/profile flow.

The Studio also includes a [working commerce reference app and provider integrations](docs/commerce-and-integrations.md), with guided overlay/navigation/API actions, environment-backed database connections, server-owned checkout totals and stock, Google OIDC, payment returns and optional Firebase push support.

Studio platform features and PostgreSQL/provider configuration are documented in [platform setup](docs/platform-setup.md).
