import test from "node:test";
import assert from "node:assert/strict";
import {
  operationInputs,
  extractComponent,
  componentUsage,
  screenUsage,
  openingOverlays,
  requestOptions,
} from "../shared/authoring.mjs";
import {
  widget,
  nodes,
  updateNode,
  prepareInsertion,
  synchronizeTabs,
} from "../shared/model.js";
import { fixture } from "./helpers.mjs";
import {
  actionFieldChoices,
  activeDesignerField,
} from "../web/designer-model.js";

test("action mapping offers entire collections and limits current-record fields to the selected collection", () => {
  const choices = actionFieldChoices(
    { products: [{ id: "p1", price: 42 }], bookings: [{ bookingId: "b1" }] },
    {
      item: true,
      query: { id: "products", select: ["id", "price"] },
      queries: [
        { id: "products", select: ["id", "price"], single: false },
        { id: "bookings", select: ["bookingId"], single: false },
      ],
    },
  );
  const keys = choices.map(([path]) => path);
  assert.ok(keys.includes("products"));
  assert.ok(keys.includes("bookings"));
  assert.ok(keys.includes("item.price"));
  assert.ok(!keys.includes("item.bookingId"));
  const dialog = {
    type: "alertDialog",
    content: { type: "text", text: "Actual content" },
  };
  assert.equal(activeDesignerField({ key: "text" }, dialog), false);
  assert.equal(activeDesignerField({ key: "title" }, dialog), true);
});

test("operation contracts include filter inputs and distinguish query fields from submitted values", () => {
  const action = {
    operation: "update",
    fields: { title: { type: "string", required: false } },
    filters: [
      { value: { from: "body", key: "id" }, optional: false },
      { value: { from: "query", key: "version" }, optional: true },
      { value: { from: "auth", key: "id" } },
    ],
  };
  assert.deepEqual(operationInputs(action), {
    data: {
      title: { type: "string", required: false },
      id: { type: "string", required: true },
    },
    query: { version: { type: "string", required: undefined } },
  });
  assert.deepEqual(
    Object.keys(operationInputs({ ...action, operation: "delete" }).data),
    ["id"],
  );
  const options = requestOptions(
    [
      { id: "draft", kind: "javascript" },
      { id: "ready", kind: "javascript", published_revision: 1 },
    ],
    [{ id: "catalog", endpoints: [{ id: "read", method: "GET" }] }],
  );
  assert.equal(options[0].disabled, true);
  assert.equal(options[1].disabled, false);
  assert.equal(options[2].source, "/runtime/http/catalog/read");
});

test("extraction updates the active component or opening overlay and usage includes both", () => {
  const doc = {
    initialScreen: "main",
    screens: [
      {
        id: "main",
        name: "Main",
        tree: { type: "text", id: "screen-text", text: "Keep" },
        onLoad: {
          type: "dialog",
          content: { type: "text", id: "opening-text", text: "Welcome" },
        },
      },
    ],
    components: [
      {
        id: "card",
        name: "Card",
        tree: {
          type: "container",
          id: "card-root",
          child: { type: "text", id: "card-title", text: "Title" },
        },
      },
    ],
    actions: [],
  };
  const first = extractComponent(doc, {
    componentId: "card",
    nodeId: "card-title",
    id: "title",
    name: "Title",
  });
  assert.equal(first.components[0].tree.child.componentId, "title");
  assert.deepEqual(first.screens, doc.screens);
  const second = extractComponent(first, {
    screenId: "main",
    nodeId: "opening-text",
    id: "welcome",
    name: "Welcome",
  });
  assert.equal(second.screens[0].onLoad.content.componentId, "welcome");
  assert.equal(componentUsage(second, "welcome")[0].id, "main");
  assert.equal(componentUsage(second, "title")[0].kind, "component");
  assert.equal(openingOverlays(second.screens[0].onLoad)[0].type, "component");
  second.components[1].tree.action = {
    type: "navigate",
    source: "/runtime/screens/main",
  };
  assert.deepEqual(screenUsage(second, "main"), ["Title"]);
  assert.equal(doc.components.length, 1);
});

test("standalone tabs include their pages, and deleting a tab synchronizes its controller and page view", () => {
  let tree = prepareInsertion(widget("tabBar"), "column");
  assert.equal(tree.type, "defaultTabController");
  assert.equal(nodes(tree).filter((n) => n.type === "tabBarView").length, 1);
  const tab = nodes(tree).find((n) => n.type === "tab");
  tree = updateNode(tree, tab.id, () => null);
  tree = synchronizeTabs(tree, tab.id);
  assert.equal(tree.length, 1);
  assert.equal(
    nodes(tree).find((n) => n.type === "tabBarView").children.length,
    1,
  );
  const view = nodes(tree).find((n) => n.type === "tabBarView");
  tree = updateNode(tree, view.id, (n) => ({
    ...n,
    children: [...n.children, widget("text")],
  }));
  tree = synchronizeTabs(tree, view.id);
  assert.equal(tree.length, 2);
  assert.equal(nodes(tree).find((n) => n.type === "tabBar").children.length, 2);
});

test("opening overlay components expand in production and can be selected for isolated Flutter authoring without running the event", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft),
    main = doc.screens[0];
  doc.components.push({
    id: "notice",
    name: "Notice",
    defaults: { title: "Welcome" },
    tree: {
      type: "alertDialog",
      title: "{{props.title}}",
      content: { type: "text", text: "Opening message" },
    },
  });
  main.onLoad = {
    type: "dialog",
    content: {
      type: "component",
      id: "opening-notice",
      componentId: "notice",
      values: { title: "Your account" },
    },
  };
  assert.equal((await f.save(doc)).status, 200);
  await f.publish();
  const result = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(result.status, 200);
  assert.equal(result.data.onLoad.content.type, "alertDialog");
  assert.equal(result.data.onLoad.content.title, "Your account");
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { document: doc, screenId: main.id, overlayId: "opening-notice" },
    f.admin,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.overlayId, "opening-notice");
  assert.equal(preview.data.widgets.body.child.type, "alertDialog");
  const invalid = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { document: doc, screenId: main.id, overlayId: "other-screen-node" },
    f.admin,
  );
  assert.equal(invalid.status, 400);
});

test("deleting a record needs its filter values without unrelated editable fields and keeps ownership", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft);
  const connection = (
    await f.server.store.all(
      "SELECT * FROM connections WHERE app_id=?",
      f.app.id,
    )
  )[0];
  const table = f.server.dataService.managedName(connection, "notes");
  await f.server.store.run(
    `INSERT INTO ${table}(id,user_id,title) VALUES(?,?,?)`,
    "own",
    "user-a",
    "Own",
  );
  await f.server.store.run(
    `INSERT INTO ${table}(id,user_id,title) VALUES(?,?,?)`,
    "other",
    "user-b",
    "Other",
  );
  const resource = {
    id: "remove-note",
    table: "notes",
    operation: "delete",
    ownerColumn: "user_id",
    fields: { title: { column: "title", type: "string", required: true } },
    filters: [{ column: "id", op: "eq", value: { from: "body", key: "id" } }],
  };
  const own = await f.server.dataService.write(connection, resource, {
    user: { id: "user-a" },
    body: { id: "own" },
    query: {},
  });
  assert.deepEqual(own, [{ id: "own" }]);
  const denied = await f.server.dataService.write(connection, resource, {
    user: { id: "user-a" },
    body: { id: "other" },
    query: {},
  });
  assert.deepEqual(denied, []);
  assert.equal(
    (await f.server.store.one(`SELECT count(*) as count FROM ${table}`)).count,
    1,
  );
});

test("notification destinations come from the published version and validate declared values before queuing", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft);
  doc.screens.push({
    id: "booking",
    name: "Booking",
    public: false,
    state: {},
    queries: [],
    parameters: {
      bookingId: { type: "string", required: true },
      quantity: { type: "integer", defaultValue: 1 },
      confirmed: { type: "boolean" },
    },
    tree: { type: "text", text: "Booking" },
  });
  assert.equal((await f.save(doc)).status, 200);
  await f.publish();
  const registration = await f.call(
    "POST",
    "/runtime/auth/register",
    {
      name: "Customer",
      email: "notification@example.com",
      password: "notification-password",
    },
    f.runtime,
  );
  assert.equal(registration.status, 200, JSON.stringify(registration.data));
  const userId = registration.data.data.user.id;
  const list = await f.call(
    "GET",
    `/api/apps/${f.app.id}/push/destinations`,
    undefined,
    f.admin,
  );
  assert.equal(list.status, 200);
  assert.equal(
    list.data.find((s) => s.id === "booking").parameters.bookingId.required,
    true,
  );
  const body = {
    userId,
    title: "Booking update",
    body: "Your booking is ready",
    screenId: "booking",
  };
  const invalid = await f.call(
    "POST",
    `/api/apps/${f.app.id}/push/send`,
    body,
    f.admin,
  );
  assert.equal(invalid.status, 400);
  assert.match(invalid.data.message, /bookingId/);
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/push/send`,
    { ...body, query: { bookingId: "b1", quantity: "2", confirmed: true } },
    f.admin,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(preview.data.preview.query, {
    bookingId: "b1",
    quantity: 2,
    confirmed: true,
  });
  assert.equal(
    (await f.server.store.one("SELECT count(*) as count FROM notifications"))
      .count,
    0,
  );
  const sent = await f.call(
    "POST",
    `/api/apps/${f.app.id}/push/send`,
    { ...preview.data.preview, confirm: true },
    f.admin,
  );
  assert.equal(sent.status, 200);
  assert.equal(sent.data.queued, true);
  const draft = structuredClone(f.app.draft);
  draft.screens.push({
    id: "draft-only",
    name: "Draft only",
    public: true,
    state: {},
    queries: [],
    tree: { type: "text", text: "Draft" },
  });
  await f.save(draft);
  assert.ok(
    !(
      await f.call(
        "GET",
        `/api/apps/${f.app.id}/push/destinations`,
        undefined,
        f.admin,
      )
    ).data.some((s) => s.id === "draft-only"),
  );
});

test("layout-only startup resolves first-tab user bindings and layout defaults before validating destination parameters", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft),
    main = doc.screens[0];
  main.parameters = { category: { type: "string", defaultValue: "featured" } };
  main.tree.bottomNavigationBar = {
    type: "navigationBar",
    id: "layout-bar",
    destinations: [
      {
        label: "Shop",
        icon: "home",
        screenId: "shop",
        query: { userId: "{{auth.user.id}}", category: "{{params.category}}" },
      },
      { label: "Profile", icon: "person", screenId: "profile" },
    ],
  };
  doc.navigation = { screenId: "main" };
  doc.screens.push({
    id: "shop",
    name: "Shop",
    public: false,
    state: {},
    queries: [],
    parameters: {
      userId: { type: "string", required: true },
      category: { type: "string" },
    },
    tree: { type: "text", text: "Shop" },
  });
  assert.equal((await f.save(doc)).status, 200);
  await f.publish();
  const registration = await f.call(
    "POST",
    "/runtime/auth/register",
    {
      name: "Customer",
      email: "layout@example.com",
      password: "layout-password",
    },
    f.runtime,
  );
  const session = registration.data.data;
  const response = await f.call("GET", "/runtime/start", undefined, {
    ...f.runtime,
    authorization: `Bearer ${session.accessToken}`,
  });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.deepEqual(response.data.state.params, {
    userId: session.user.id,
    category: "featured",
  });
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    {
      document: doc,
      screenId: "main",
      dataMode: "database",
      userId: session.user.id,
    },
    f.admin,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(preview.data.state.params, response.data.state.params);
});
