# Build an app in Studio

Studio serves published screens to the Flutter app. Your app connects with its server URL and a runtime key; private content also requires a signed-in user.

## Where things belong

| Place | Use it for |
| --- | --- |
| Screens | Design pages, incoming values, opening events and shared navigation |
| Components | Reusable designs with editable properties and sample records |
| Content | Connect databases or APIs and choose the content for a selected screen |
| Interactions | Find trigger setup and create reusable database operations |
| AI design | Generate a proposed screen/component with your provider account |
| App settings → Users & sign-in | App users and authentication UI |
| App settings → Integrations | Provider readiness, external destinations and push |
| App settings → Connect app | Runtime keys and Flutter connection instructions |
| App settings → Custom code | Author/test extension modules |
| App settings → Releases | Published versions and rollback |

## One bottom bar for several screens

Create at least two screens. On a screen with a Scaffold, click the screen name in the left list to open Setup. Choose **Use this screen as navigation layout**. Set the tab labels and destination screens. Select the bottom navigation layer to change its icons, colors and dimensions.

Each destination inherits that bar automatically, including the selected tab. Keep the actual page content on each destination screen. Opening a tab replaces the current tab route; it does not grow a back stack for every tab selection. A screen outside those destinations opens without the bar. Navigation does not grant access to a private screen.

## A product detail example

1. Create a Details screen. In Setup → Incoming values, add `productId` as Text, mark it required and enter `p2` as a preview example.
2. Open Content and select Details. Add a database source, choose Products and One record, then choose the fields to display.
3. Name the source `product`. Add a filter: ID is equal to a Screen parameter → `productId`.
4. Add a Text layer. In its Content tab, choose Product → Name. No expression needs to be typed.
5. On a product card, open Interactions and choose Open screen → Details. The productId input appears automatically. Choose its source as Current record → ID. For a shared navigation item, fill the same parameter inputs on that tab.

The server validates declared incoming values before loading content. User identity always comes from the verified session; an incoming user ID never grants ownership.

## Save records with a form

Open Interactions → Create action. Choose Create, Update or Delete, then choose a database, table and ownership field. Select the values the app can edit and mark the required ones. Record filters narrow the user's records; for example, ID equals the submitted `id` input.

Attach the operation to a button using Validate and submit form or Call API endpoint. Its named inputs appear automatically, including filter values such as `id`. A submitted form supplies matching input names; use a value picker to override them. Add form to screen builds these inputs for you. Delete operations use their filters and do not need editable field values.

## Test an API connection

In Content → API connections, save a service and endpoint. Test inputs accepts named query values and, for a write request, body values. Select an app user for private endpoints. A write test requires confirmation because it can change records at your connected API.

Connect a GET endpoint to the selected screen. Edit its API parameters to use incoming screen values or the verified user. Use a successful response as sample content, or preview Live content, then choose its fields from a layer's Content inspector. Edit endpoint changes the existing endpoint while preserving the service's other endpoints and credentials.

## Sign-in and notification destinations

App settings → Users & sign-in lists sign-in forms and their success destinations. Create sign-in screen supplies sign-in, registration and recovery modes, with an optional start-screen setup. Private pages still need Require sign-in in Screen setup.

For OAuth actions, choose After OAuth returns and map its destination parameters. Built-in sign-in forms preserve a direct Open/Replace screen success destination across the callback, including app restart. Without a destination, OAuth returns to the app's start screen. Launching the browser is not a completed sign-in.

In Integrations → Send a notification, choose a user, a published screen and its incoming values. Required values are validated before queuing. Publish new screens or parameter changes before using them as notification destinations.

## When a screen opens

Click the screen name and open Interactions. **When screen opens** runs once after the first successful render in the connected app. Choose a step or an ordered sequence. Refreshing the screen's content does not repeat the opening event. Opening a new screen instance runs it again.

To run backend code, first save and enable a JavaScript module in App settings → Custom code. Back in the screen editor, choose Run backend function and select its name. Add named Request data fields, choosing fixed values, incoming screen values, form fields or current-record fields. Save the response to a name such as `welcome`; its returned fields can be connected to layers. Backend functions require a signed-in app user. Use a sample record for authoring when the canvas cannot run a provider-dependent step.

Use when the selected screen opens adds an enabled function directly from Custom code and marks the screen private. For an opening dialog or sheet, choose Edit overlay content in Layers to style its contents in Flutter. Component content is expanded in both preview and published delivery.

The editing canvas never executes opening actions automatically. It supports screen navigation and safe content reads. Authentication, database writes, payments and native integrations require the connected app. Backend JavaScript is a bounded synchronous calculation, not arbitrary Node.js. Dart extensions must be compiled into the host and preview.

## Save, preview and publish

Draft changes autosave after a short pause. Unsaved work has a local recovery copy; a stale recovery copy is offered for review instead of overwriting a newer server draft. Undo and Redo operate on the current editing session.

Ctrl/Cmd+S also saves when the Flutter canvas has keyboard focus. In edit mode, the canvas forwards Studio's undo, redo, duplicate and delete shortcuts; interactive text fields keep their editing shortcuts.

Use Sample content for examples or Live content for authorized database/API reads. Private reads require a selected app user. Components have their own preview record controls. Compare the same records, screen width, appearance and release when checking the connected app.

Publish captures screens, components, theme, API definitions and enabled backend functions. API and code drafts affect the next release. Rollback restores those captured definitions. Secret credentials remain encrypted on the server; provider accounts and device setup remain deployment configuration.
