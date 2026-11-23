import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
import { openStore } from "../server/store.mjs";
import { effective } from "../shared/screens.mjs";

test("one shared bar renders every destination, selects the correct tab and passes typed screen parameters to a filtered query", async (t) => {
  const f = await fixture(t);
  const doc = structuredClone(f.app.draft),
    main = doc.screens[0];
  main.tree.bottomNavigationBar = {
    type: "navigationBar",
    id: "shared-bar",
    backgroundColor: "#123456",
    destinations: [
      { label: "Shop", icon: "home", screenId: "main" },
      {
        label: "Featured",
        icon: "person",
        screenId: "detail",
        query: { productId: "p2", quantity: 2 },
      },
    ],
  };
  doc.navigation = { screenId: "main" };
  doc.screens.push({
    id: "detail",
    name: "Product details",
    public: true,
    parameters: {
      productId: { type: "string", required: true, sampleValue: "p2" },
      quantity: { type: "integer", defaultValue: 1 },
    },
    queries: [
      {
        ...main.queries[0],
        id: "product",
        single: true,
        filters: [
          {
            column: "id",
            op: "eq",
            value: { from: "query", key: "productId" },
          },
        ],
      },
    ],
    onLoad: { type: "set", path: "opened", value: true },
    tree: { type: "text", id: "detail-title", text: "{{product.name}}" },
  });
  const saved = await f.save(doc);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await f.publish()).status, 200);
  const start = (await f.call("GET", "/runtime/start", undefined, f.runtime))
    .data;
  assert.equal(start.widgets.bottomNavigationBar.selectedIndex, 0);
  assert.equal(start.widgets.bottomNavigationBar.backgroundColor, "#123456");
  const destination = await f.call(
    "GET",
    "/runtime/screens/detail?productId=p2&quantity=3",
    undefined,
    f.runtime,
  );
  assert.equal(destination.status, 200, JSON.stringify(destination.data));
  assert.equal(destination.data.state.product.name, "Everyday backpack");
  assert.deepEqual(destination.data.state.params, {
    productId: "p2",
    quantity: 3,
  });
  assert.equal(destination.data.widgets.type, "scaffold");
  assert.equal(destination.data.widgets.bottomNavigationBar.selectedIndex, 1);
  assert.equal(
    destination.data.widgets.bottomNavigationBar.destinations[0].action.type,
    "replace",
  );
  assert.deepEqual(destination.data.onLoad, {
    type: "set",
    path: "opened",
    value: true,
  });
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    {
      source: "published",
      screenId: "detail",
      dataMode: "database",
      query: { productId: "p2", quantity: "3" },
    },
    f.admin,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(preview.data.widgets, destination.data.widgets);
  assert.deepEqual(preview.data.state, destination.data.state);
  assert.equal(
    (await f.call("GET", "/runtime/screens/detail", undefined, f.runtime))
      .status,
    400,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/screens/detail?productId=p2&quantity=oops",
        undefined,
        f.runtime,
      )
    ).status,
    400,
  );
  // A Main screen can be layout-only; its first item supplies opening defaults.
  const layout = {
    id: "layout",
    name: "Main layout",
    public: true,
    queries: [],
    tree: {
      type: "scaffold",
      bottomNavigationBar: {
        ...main.tree.bottomNavigationBar,
        destinations: [...main.tree.bottomNavigationBar.destinations].reverse(),
      },
    },
  };
  doc.screens.push(layout);
  doc.navigation.screenId = "layout";
  doc.initialScreen = "layout";
  await f.save(doc);
  await f.publish();
  const firstTab = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(firstTab.status, 200, JSON.stringify(firstTab.data));
  assert.equal(firstTab.data.screenId, "detail");
  assert.equal(firstTab.data.state.product.id, "p2");
  assert.equal(firstTab.data.widgets.bottomNavigationBar.selectedIndex, 0);
  // The shared bar never bypasses a private destination's guard.
  doc.screens.find((s) => s.id === "detail").public = false;
  await f.save(doc);
  await f.publish();
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/screens/detail?productId=p2",
        undefined,
        f.runtime,
      )
    ).status,
    401,
  );
});

test("navigation rejects missing or duplicate screens and a blank app starts without example records", async (t) => {
  const f = await fixture(t);
  const doc = structuredClone(f.app.draft);
  doc.navigation = { screenId: "main" };
  doc.screens[0].tree.bottomNavigationBar = {
    type: "navigationBar",
    destinations: [{ screenId: "main" }, { screenId: "missing" }],
  };
  assert.equal((await f.save(doc)).status, 400);
  doc.screens[0].tree.bottomNavigationBar.destinations[1].screenId = "main";
  assert.equal((await f.save(doc)).status, 400);
  const blank = await f.call(
    "POST",
    "/api/apps",
    { name: "Clean app", template: "blank" },
    f.admin,
  );
  assert.equal(blank.status, 201);
  assert.equal(blank.data.draft.screens.length, 1);
  assert.equal(blank.data.draft.screens[0].queries.length, 0);
  const connection = (
    await f.call(
      "GET",
      `/api/apps/${blank.data.id}/connections`,
      undefined,
      f.admin,
    )
  ).data[0];
  const table = f.server.dataService.managedName(
    { ...connection, app_id: blank.data.id },
    "products",
  );
  assert.equal(
    (await f.server.store.one(`SELECT COUNT(*) AS count FROM ${table}`)).count,
    0,
  );
});

test("optional screen parameters do not become null filters and preview-only function records never ship as runtime data", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft);
  doc.screens[0].parameters = { q: { type: "string", required: false } };
  doc.screens[0].previewData = {
    welcome: { message: "Example function response" },
  };
  doc.components.push({
    id: "stock-card",
    name: "Stock card",
    defaults: {},
    tree: {
      type: "conditional",
      condition: "{{item.available}}",
      then: { type: "text", text: "In stock" },
      else: { type: "text", text: "Sold out" },
    },
  });
  assert.equal((await f.save(doc)).status, 200);
  assert.equal((await f.publish()).status, 200);
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { dataMode: "sample" },
    f.admin,
  );
  assert.equal(preview.data.state.welcome.message, "Example function response");
  const records = await f.call(
    "POST",
    `/api/apps/${f.app.id}/query-preview`,
    { screenId: "main", queryId: "products" },
    f.admin,
  );
  assert.equal(records.status, 200, JSON.stringify(records.data));
  assert.equal(records.data.items.length, 3);
  const live = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(live.status, 200, JSON.stringify(live.data));
  assert.equal(live.data.state.welcome, undefined);
  assert.equal(live.data.state.params.q, undefined);
  const card = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    {
      componentId: "stock-card",
      sampleState: { products: [{ name: "Example" }] },
    },
    f.admin,
  );
  assert.equal(card.status, 200, JSON.stringify(card.data));
  assert.equal(card.data.state.item.available, true);
  doc.components.at(-1).previewData = { item: { available: false } };
  const soldOut = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { document: doc, componentId: "stock-card" },
    f.admin,
  );
  assert.equal(soldOut.data.state.item.available, false);
});

test("published API definitions and backend functions stay pinned until publish, and roll back together", async (t) => {
  const paths = [];
  const f = await fixture(t, {
    httpHosts: ["api.example.com"],
    httpFetch: async (url) => {
      paths.push(new URL(url).pathname);
      return new Response(JSON.stringify({ name: new URL(url).pathname }), {
        headers: { "content-type": "application/json" },
      });
    },
  });
  const root = `/api/apps/${f.app.id}`;
  const saveApi = (path) =>
    f.call(
      "PUT",
      `${root}/http-services/catalog`,
      {
        baseUrl: "https://api.example.com",
        headers: { authorization: "Bearer private-server-key" },
        endpoints: [{ id: "products", method: "GET", path, public: true }],
      },
      f.admin,
    );
  await saveApi("/v1");
  await f.call(
    "PUT",
    `${root}/code/calculate`,
    { kind: "javascript", source: "(c) => ({ amount: 10, user: c.user.id })" },
    f.admin,
  );
  await f.call(
    "POST",
    `${root}/code/calculate/publish`,
    { revision: 1 },
    f.admin,
  );
  const doc = structuredClone(f.app.draft);
  doc.screens[0].httpQueries = [
    { id: "catalog", serviceId: "catalog", endpointId: "products", query: {} },
  ];
  await f.save(doc);
  await f.publish();
  const customer = (
    await f.call(
      "POST",
      "/runtime/auth/register",
      {
        email: "workflow@example.com",
        name: "Customer",
        password: "workflow-test-password",
      },
      f.runtime,
    )
  ).data.data;
  const headers = {
    ...f.runtime,
    authorization: `Bearer ${customer.accessToken}`,
  };
  const calculate = () =>
    f.call("POST", "/runtime/functions/calculate", {}, headers);
  await saveApi("/v2");
  await f.call(
    "PUT",
    `${root}/code/calculate`,
    { kind: "javascript", revision: 1, source: "() => ({ amount: 20 })" },
    f.admin,
  );
  await f.call(
    "POST",
    `${root}/code/calculate/publish`,
    { revision: 2 },
    f.admin,
  );
  assert.equal((await calculate()).data.data.amount, 10);
  const screen = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(screen.data.state.catalog.name, "/v1");
  assert.ok(!JSON.stringify(screen.data).includes("private-server-key"));
  const preview = await f.call(
    "POST",
    `${root}/preview`,
    { source: "published", dataMode: "database" },
    f.admin,
  );
  assert.equal(preview.data.state.catalog.name, "/v1");
  await f.publish();
  assert.equal((await calculate()).data.data.amount, 20);
  assert.equal(
    (await f.call("GET", "/runtime/start", undefined, f.runtime)).data.state
      .catalog.name,
    "/v2",
  );
  await f.call("POST", `${root}/releases/1/activate`, {}, f.admin);
  assert.equal((await calculate()).data.data.amount, 10);
  assert.equal(
    (await f.call("GET", "/runtime/start", undefined, f.runtime)).data.state
      .catalog.name,
    "/v1",
  );
});

test("database migrations are applied once and reject a changed historical checksum", async (t) => {
  const f = await fixture(t),
    store = f.server.store;
  assert.equal(
    (await store.all("SELECT version FROM schema_migrations")).length,
    4,
  );
  await store.run(
    "UPDATE schema_migrations SET checksum='changed' WHERE version=2",
  );
  await assert.rejects(
    openStore(store.pool.options.connectionString, {
      schema: store.schema,
      tls: false,
    }),
    /migration 2 has changed/,
  );
});
