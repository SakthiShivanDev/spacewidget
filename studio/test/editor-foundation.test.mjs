import test from "node:test";
import assert from "node:assert/strict";
import {
  widgetOptions,
  searchWidgets,
  availableComponents,
} from "../web/widget-search.js";
import { moveWidget, nodes, insertInto } from "../web/model.js";
import { expandPreviewTree, expandTree } from "../server/schema.mjs";
import { fixture } from "./helpers.mjs";

test("widget search accepts human labels, type names, categories and fuzzy input across child slots", () => {
  const components = [
    {
      id: "product-grid",
      name: "Product grid",
      tree: { type: "text", text: "Grid" },
    },
  ];
  const options = widgetOptions({ components });
  for (const query of [
    "bottom navigation",
    "bottomNavigationBar",
    "btmnvgtnbr",
  ])
    assert.equal(searchWidgets(options, query)[0].value, "bottomNavigationBar");
  assert.ok(
    searchWidgets(options, "product grid").some(
      (o) => o.value === "component:product-grid",
    ),
  );
  assert.ok(
    searchWidgets(options, "authentication").some(
      (o) => o.value === "loginForm",
    ),
  );
  assert.deepEqual(
    widgetOptions({ slot: "appBar" }).map((o) => o.value),
    ["appBar"],
  );
  assert.deepEqual(
    widgetOptions({ parentType: "tabBar", slot: "children" }).map(
      (o) => o.value,
    ),
    ["tab"],
  );
  assert.ok(
    widgetOptions({ form: true }).every(
      (o) => !o.value.startsWith("component:"),
    ),
  );
  assert.ok(
    widgetOptions({ slot: "headers" }).some((o) => o.value === "sliverAppBar"),
  );
  assert.equal(
    widgetOptions({ slot: "headers" }).some((o) => o.value === "text"),
    false,
  );
  assert.equal(searchWidgets(options, "zzzzmissingwidget").length, 0);
});
test("component insertion excludes direct and indirect cycles", () => {
  const components = [
    { id: "a", tree: { type: "text" } },
    { id: "b", tree: { type: "component", componentId: "a" } },
    {
      id: "c",
      tree: {
        type: "column",
        children: [{ type: "component", componentId: "b" }],
      },
    },
    { id: "safe", tree: { type: "text" } },
  ];
  assert.deepEqual(
    availableComponents(components, "a").map((c) => c.id),
    ["safe"],
  );
});
test("layer moves preserve IDs, reject cycles and support before, after and reparenting", () => {
  const tree = {
    type: "column",
    id: "root",
    children: [
      {
        type: "column",
        id: "group",
        children: [{ type: "input", id: "field", name: "email" }],
      },
      { type: "text", id: "label", text: "Name" },
      { type: "column", id: "empty", children: [] },
    ],
  };
  assert.equal(moveWidget(tree, "group", "field"), tree);
  assert.equal(moveWidget(tree, "root", "empty"), tree);
  const moved = moveWidget(tree, "field", "empty");
  assert.equal(moved.children[0].children.length, 0);
  assert.equal(moved.children[2].children[0].name, "email");
  const sorted = moveWidget(tree, "label", "group", "before");
  assert.deepEqual(
    sorted.children.map((n) => n.id),
    ["label", "group", "empty"],
  );
  assert.equal(new Set(nodes(moved).map((n) => n.id)).size, nodes(tree).length);
  assert.equal(tree.children[0].children[0].id, "field");
});
test("expanded preview identities select component instances, including nested components, without leaking metadata to runtime", () => {
  const doc = {
    components: [
      {
        id: "inner",
        defaults: {},
        tree: { type: "text", id: "text", text: "Hello" },
      },
      {
        id: "outer",
        defaults: {},
        tree: {
          type: "column",
          id: "column",
          children: [{ type: "component", id: "nested", componentId: "inner" }],
        },
      },
    ],
  };
  const instance = { type: "component", id: "instance", componentId: "outer" };
  const result = expandPreviewTree(instance, doc);
  assert.equal(result.sourceMap["instance:column"].nodeId, "instance");
  assert.equal(result.sourceMap["instance:nested:text"].nodeId, "instance");
  const editing = expandPreviewTree({ ...instance, id: "preview" }, doc);
  assert.equal(editing.sourceMap["preview:column"].nodeId, "column");
  assert.equal(editing.sourceMap["preview:nested:text"].nodeId, "nested");
  assert.ok(!JSON.stringify(result.widgets).includes("_studio"));
  assert.deepEqual(expandTree(instance, doc), result.widgets);
});
test("preview returns unsaved theme, component scope, source mapping and sample state without saving the draft", async (t) => {
  const f = await fixture(t),
    document = structuredClone(f.app.draft);
  document.theme = { seedColor: "#123456", backgroundColor: "#f0f0f0" };
  document.components.push({
    id: "test",
    name: "Test",
    defaults: {},
    tree: { type: "text", id: "test-label", text: "Unsaved" },
  });
  const result = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { document, componentId: "test", sampleState: { count: 9 } },
    f.admin,
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.theme, document.theme);
  assert.equal(result.data.componentId, "test");
  assert.equal(
    result.data.sourceMap["preview:test-label"].nodeId,
    "test-label",
  );
  assert.equal(result.data.state.count, 9);
  const persisted = (
    await f.call("GET", `/api/apps/${f.app.id}`, undefined, f.admin)
  ).data;
  assert.equal(
    persisted.draft.components.some((c) => c.id === "test"),
    false,
  );
});

test("constrained slots include compatible reusable components and adapt sliver children", () => {
  const components = [
    { id: "header", name: "Header", tree: { type: "appBar" } },
    { id: "field", name: "Email field", tree: { type: "input" } },
    { id: "sliver", name: "Section", tree: { type: "sliverList" } },
    { id: "text", name: "Label", tree: { type: "text" } },
  ];
  assert.ok(
    widgetOptions({ components, slot: "appBar" }).some(
      (o) => o.value === "component:header",
    ),
  );
  assert.equal(
    widgetOptions({ components, slot: "appBar" }).some(
      (o) => o.value === "component:text",
    ),
    false,
  );
  assert.ok(
    widgetOptions({ components, form: true }).some(
      (o) => o.value === "component:field",
    ),
  );
  assert.ok(
    widgetOptions({ components, slot: "headers" }).some(
      (o) => o.value === "component:sliver",
    ),
  );
  const padding = { type: "sliverPadding", id: "padding" };
  const result = insertInto(padding, "padding", {
    type: "text",
    id: "label",
    text: "Sliver content",
  });
  assert.equal(result.child.type, "sliverToBoxAdapter");
  assert.equal(result.child.child.id, "label");
});
