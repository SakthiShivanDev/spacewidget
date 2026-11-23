import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
import { expandTree } from "../server/schema.mjs";
import {
  bindingContext,
  bindingChoices,
  bindingPatch,
  repeatedCollection,
  queryFromBinding,
} from "../web/designer-model.js";
import { hydrate, nodes } from "../web/model.js";
import { widgetTypes } from "../server/schema.mjs";

test("published preview uses the same release, theme, expanded widgets and public records as the connected app", async (t) => {
  const f = await fixture(t);
  await f.publish();
  const runtime = (await f.call("GET", "/runtime/start", undefined, f.runtime))
    .data;
  const doc = structuredClone(f.app.draft);
  doc.screens[0].tree.body = { type: "text", text: "Draft changes only" };
  await f.save(doc);
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    {
      source: "published",
      dataMode: "database",
      document: doc,
      sampleState: { products: [{ name: "Wrong sample" }] },
    },
    f.admin,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(preview.data.theme, runtime.theme);
  assert.deepEqual(preview.data.widgets, runtime.widgets);
  assert.deepEqual(preview.data.state, runtime.state);
  assert.equal(preview.data.preview.version, 1);
  assert.deepEqual(preview.data.sourceMap, {});
  const draft = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { document: doc },
    f.admin,
  );
  assert.match(JSON.stringify(draft.data.widgets), /Draft changes only/);
  const still = (await f.call("GET", "/runtime/start", undefined, f.runtime))
    .data;
  assert.deepEqual(still.widgets, runtime.widgets);
});
test("query previews support unsaved definitions without saving, and private records need an explicit app user", async (t) => {
  const f = await fixture(t),
    before = structuredClone(f.app.draft),
    doc = structuredClone(before);
  const main = doc.screens[0],
    q = {
      ...main.queries.find((q) => q.id === "products"),
      id: "catalog",
      select: ["name"],
    };
  main.queries.push(q);
  const preview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/query-preview`,
    { document: doc, screenId: main.id, queryId: "catalog" },
    f.admin,
  );
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.data.items.length, 3);
  const saved = await f.call(
    "GET",
    `/api/apps/${f.app.id}`,
    undefined,
    f.admin,
  );
  assert.deepEqual(saved.data.draft, before);
  const profile = doc.screens.find((s) => s.id === "profile");
  const privatePreview = await f.call(
    "POST",
    `/api/apps/${f.app.id}/query-preview`,
    { document: doc, screenId: profile.id, queryId: profile.queries[0].id },
    f.admin,
  );
  assert.equal(privatePreview.status, 400);
  const canvas = await f.call(
    "POST",
    `/api/apps/${f.app.id}/preview`,
    { document: doc, screenId: profile.id, dataMode: "database" },
    f.admin,
  );
  assert.equal(canvas.status, 200);
  assert.ok(canvas.data.preview.warnings.length);
  assert.equal(canvas.data.state[profile.queries[0].id], undefined);
});
test("repeated collections bind to the nearest record, list data is not offered as text, and Figma literal text becomes dynamic when connected", () => {
  let id = 0;
  const q = {
    id: "products",
    table: "products",
    select: ["id", "name", "category"],
    single: false,
  };
  const repeat = repeatedCollection(
    q,
    { layout: "grid", subtitleField: "" },
    () => `n${++id}`,
  );
  assert.equal(repeat.items, "{{products}}");
  assert.equal(repeat.layout, "grid");
  assert.equal(
    nodes(repeat).some((n) => n.text === "{{item.category}}"),
    false,
  );
  const node = nodes(repeat).find(
    (n) => n.type === "text" && n.text === "{{item.name}}",
  );
  const doc = {
    screens: [{ id: "main", queries: [q], tree: repeat }],
    components: [],
  };
  const context = bindingContext(doc, doc.screens[0], repeat, node);
  assert.ok(
    bindingChoices(context, "text").some((c) => c.value === "{{item.name}}"),
  );
  assert.ok(
    !bindingChoices(context, "text").some((c) => c.value === "{{products}}"),
  );
  assert.deepEqual(
    bindingPatch({ ...node, literal: true }, "text", "{{item.name}}"),
    { text: "{{item.name}}", literal: false },
  );
  assert.throws(() => bindingPatch(node, "notAProperty", "bad"));
  const outer = {
    type: "repeat",
    id: "outer",
    items: [{ outer: "Outer" }],
    template: repeat,
  };
  assert.equal(
    bindingContext(doc, doc.screens[0], outer, node).query.id,
    "products",
  );
});
test("component item designers discover the collection supplied by the instance without rewriting its reusable binding", () => {
  let id = 0;
  const q = {
    id: "products",
    table: "products",
    select: ["name", "price"],
    single: false,
  };
  const repeat = repeatedCollection(q, {}, () => `n${++id}`);
  repeat.items = "{{props.items}}";
  const component = { id: "cards", defaults: { items: [] }, tree: repeat };
  const screen = {
    id: "main",
    queries: [q],
    tree: {
      type: "component",
      id: "instance",
      componentId: "cards",
      values: { items: "{{products}}" },
    },
  };
  const doc = { screens: [screen], components: [component] };
  const node = nodes(repeat).find((n) => n.type === "listTile");
  const ctx = bindingContext(doc, screen, repeat, node, "cards");
  assert.equal(ctx.query.id, "products");
  assert.ok(
    bindingChoices(ctx, "title", component).some(
      (c) => c.value === "{{item.price}}",
    ),
  );
  assert.equal(component.tree.items, "{{props.items}}");
});

test("designer color swatches match Flutter named and ARGB colors, preserving alpha when changed", async () => {
  const { colorSwatch, applyColorSwatch } = await import(
    "../web/designer-model.js"
  );
  assert.equal(colorSwatch("blue"), "#2196f3");
  assert.equal(colorSwatch("#801674E8"), "#1674e8");
  assert.equal(colorSwatch(0x801674e8), "#1674e8");
  assert.equal(colorSwatch("#abc"), "#aabbcc");
  assert.equal(applyColorSwatch("#801674E8", "#ff0000"), "#80ff0000");
  assert.equal(applyColorSwatch("blue", "#ff0000"), "#ff0000");
});
