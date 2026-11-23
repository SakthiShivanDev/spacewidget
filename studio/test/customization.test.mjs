import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  widget,
  hydrate,
  insertInto,
  nodes,
  duplicateWidget,
  synchronizeTabs,
  updateNode,
} from "../web/model.js";
import {
  widgetCatalog,
  properties,
  patchProperties,
  fieldsFor,
} from "../web/widget-catalog.js";
import { parseProperty } from "../web/property-values.js";
import { parseDefinition, widgetTypes } from "../server/schema.mjs";

test("every runtime widget has an editor, valid defaults and individually selectable nested widgets", () => {
  const flutter = readFileSync(
    new URL("../../lib/src/widgets.dart", import.meta.url),
    "utf8",
  )
    .split("const spaceWidgetTypes")[1]
    .split("Widget _buildWidget")[0];
  for (const type of flutter.matchAll(/'([^']+)'/g))
    assert.ok(widgetCatalog[type[1]], `Missing core widget ${type[1]}`);
  for (const type of widgetTypes) {
    assert.ok(widgetCatalog[type], `Missing editor ${type}`);
    const tree = widget(type);
    assert.ok(fieldsFor(tree).length > 0, `Missing controls ${type}`);
    assert.doesNotThrow(
      () =>
        parseDefinition({
          schemaVersion: 1,
          initialScreen: "main",
          screens: [{ id: "main", name: "Main", public: true, tree }],
        }),
      type,
    );
    const all = nodes(tree);
    assert.equal(
      new Set(all.map((node) => node.id)).size,
      all.length,
      `Duplicate defaults IDs: ${type}`,
    );
  }
});
test("editing and resetting effective properties honors Flutter props and style precedence", () => {
  const original = {
    widgetType: "text",
    id: "legacy",
    style: { fontSize: 12, color: "red" },
    text: "top",
    props: { text: "effective", fontSize: 20 },
  };
  const edited = patchProperties(original, {
    text: "Updated",
    fontSize: 26,
    color: "blue",
  });
  assert.equal(properties(edited).text, "Updated");
  assert.equal(properties(edited).fontSize, 26);
  assert.equal(properties(edited).color, "blue");
  assert.equal(
    properties(patchProperties(edited, { fontSize: undefined })).fontSize,
    undefined,
  );
  assert.equal(original.props.text, "effective");
  const hydrated = hydrate(structuredClone(original), widgetTypes);
  assert.equal(nodes(hydrated)[0].id, "legacy");
});
test("form insertion adds visible fields for both children and child-layout forms with unique names", () => {
  for (const form of [
    widget("form"),
    {
      type: "form",
      id: "legacy-form",
      children: [],
      child: { type: "column", id: "layout", children: [] },
    },
  ]) {
    const first = widget("input"),
      second = widget("input"),
      third = widget("dropdown");
    let tree = insertInto(form, form.id, first);
    tree = insertInto(tree, form.id, second);
    tree = insertInto(tree, form.id, third);
    const fields = tree.child ? tree.child.children : tree.children;
    assert.equal(fields.length, 3);
    assert.equal(new Set(fields.map((field) => field.name)).size, 3);
    assert.ok(fields[2].options.length >= 2);
  }
});
test("navigation, slivers, flex and tab insertion preserve required Flutter parent layouts", () => {
  const root = () => ({
    type: "scaffold",
    id: "screen",
    body: { type: "listView", id: "body", children: [] },
  });
  const nav = widget("bottomNavigationBar");
  const screen = insertInto(root(), "body", nav);
  assert.equal(screen.bottomNavigationBar.id, nav.id);
  assert.equal(screen.bottomNavigationBar.destinations.length, 2);
  for (const type of [
    "sliverList",
    "expanded",
    "positioned",
    "tabBar",
    "pageView",
  ]) {
    const added = insertInto(root(), "body", widget(type));
    assert.notEqual(
      added.body.children[0].type,
      type,
      `${type} requires a parent`,
    );
  }
});
test("duplication remaps supplied widget IDs and submit form references, preserving business IDs", () => {
  const form = {
    type: "form",
    id: "profile",
    children: [
      { type: "input", id: "name", name: "name" },
      {
        type: "button",
        id: "save",
        action: { type: "submit", form: "profile", data: { id: "record-1" } },
      },
    ],
  };
  const copy = duplicateWidget(form);
  assert.notEqual(copy.id, "profile");
  assert.notEqual(copy.children[0].id, "name");
  assert.equal(copy.children[1].action.form, copy.id);
  assert.equal(copy.children[1].action.data.id, "record-1");
});
test("property editing rejects malformed native values without losing bindings or JSON types", () => {
  assert.equal(
    parseProperty("{{user.age}}", { kind: "number" }),
    "{{user.age}}",
  );
  assert.equal(parseProperty("16", { kind: "number", min: 0 }), 16);
  assert.deepEqual(
    parseProperty('{"horizontal":16,"vertical":8}', { kind: "insets" }),
    { horizontal: 16, vertical: 8 },
  );
  assert.deepEqual(
    parseProperty('[{"label":"First","value":42}]', { kind: "array" }),
    [{ label: "First", value: 42 }],
  );
  for (const [value, field] of [
    ["NaN", { kind: "number" }],
    ["-1", { kind: "number", min: 0 }],
    ["1.5", { kind: "number", integer: true }],
    ["broken", { kind: "color" }],
    ["{}", { kind: "array" }],
    ['{"left":-1}', { kind: "insets" }],
  ])
    assert.throws(() => parseProperty(value, field));
});

test("editing either tab list synchronizes the controller, labels and pages", () => {
  let tree = widget("defaultTabController");
  const tab = nodes(tree).find((node) => node.type === "tabBar");
  tree = updateNode(tree, tab.id, (node) => ({
    ...node,
    children: [...node.children, widget("tab")],
  }));
  tree = synchronizeTabs(tree, tab.id);
  assert.equal(tree.length, 3);
  assert.equal(
    nodes(tree).find((node) => node.type === "tabBarView").children.length,
    3,
  );
  const view = nodes(tree).find((node) => node.type === "tabBarView");
  tree = updateNode(tree, view.id, (node) => ({
    ...node,
    children: node.children.slice(0, 1),
  }));
  tree = synchronizeTabs(tree, view.id);
  assert.equal(tree.length, 1);
  assert.equal(
    nodes(tree).find((node) => node.type === "tabBar").children.length,
    1,
  );
});

test("API payload and collection record type fields are data rather than widget declarations", async () => {
  const { expandTree } = await import("../server/schema.mjs");
  const tree = {
    type: "filledButton",
    action: {
      type: "request",
      source: "/bookings",
      data: {
        type: "booking",
        content: "{{message}}",
        items: [{ id: "record", type: "physical" }],
      },
    },
  };
  assert.deepEqual(expandTree(tree, { components: [] }), tree);
  const repeat = {
    type: "repeat",
    items: [{ type: "course", name: "Course" }],
    template: { type: "text", text: "{{item.name}}" },
  };
  assert.deepEqual(expandTree(repeat, { components: [] }), repeat);
});
