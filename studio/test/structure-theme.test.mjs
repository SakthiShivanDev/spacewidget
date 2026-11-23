import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateInTree,
  wrapWidget,
  replaceWidget,
  moveWidget,
  nodes,
  widget,
} from "../web/model.js";
import { properties } from "../web/widget-catalog.js";
import { designerField } from "../web/designer-model.js";
import { parseProperty } from "../web/property-values.js";
import { fixture } from "./helpers.mjs";
const tree = () => ({
  type: "scaffold",
  id: "screen",
  body: {
    type: "listView",
    id: "outer",
    children: [
      {
        type: "container",
        id: "box",
        child: { type: "text", id: "text", text: "{{user.name}}" },
      },
      { type: "listView", id: "inner", shrinkWrap: true, children: [] },
    ],
  },
});
test("duplicate stays in its original single-child slot and does not mutate the document", () => {
  const before = tree(),
    next = duplicateInTree(before, "text");
  const box = next.tree.body.children[0];
  assert.equal(box.id, "box");
  assert.equal(box.child.type, "column");
  assert.deepEqual(
    box.child.children.map((n) => n.text),
    ["{{user.name}}", "{{user.name}}"],
  );
  assert.equal(box.child.children[1].id, next.id);
  assert.equal(before.body.children[0].child.id, "text");
  const copy = duplicateInTree(before, "box");
  assert.equal(copy.tree.body.children[1].id, copy.id);
});
test("cross-list and single-child moves preserve IDs and reject cycles", () => {
  const moved = moveWidget(tree(), "box", "inner");
  assert.equal(moved.body.children.length, 1);
  assert.equal(moved.body.children[0].children[0].child.id, "text");
  assert.equal(
    new Set(nodes(moved).map((n) => n.id)).size,
    nodes(moved).length,
  );
  assert.equal(moveWidget(moved, "inner", "text"), moved);
  const single = moveWidget(tree(), "inner", "text", "before");
  assert.equal(single.body.children.length, 1);
  assert.deepEqual(
    single.body.children[0].child.children.map((n) => n.id),
    ["inner", "text"],
  );
});
test("wrap and layout replacement keep content, IDs and data bindings, rejecting lossy conversions", () => {
  const wrapped = wrapWidget(tree(), "box", "padding");
  assert.equal(wrapped.tree.body.children[0].child.id, "box");
  assert.equal(wrapped.tree.body.children[0].child.child.text, "{{user.name}}");
  const replaced = replaceWidget(tree(), "box", "listView");
  assert.equal(replaced.body.children[0].id, "box");
  assert.equal(replaced.body.children[0].children[0].id, "text");
  assert.throws(() => replaceWidget(tree(), "box", "icon"), /remove child/);
  assert.throws(() => wrapWidget(tree(), "text", "icon"), /compatible wrapper/);
  const component = wrapWidget(
    { type: "text", id: "root", text: "Reusable" },
    "root",
    "container",
  );
  assert.equal(component.tree.child.text, "Reusable");
  const refresh = wrapWidget(tree(), "box", "refreshIndicator");
  assert.equal(refresh.tree.body.children[0].onRefresh.type, "refresh");
  assert.equal(
    refresh.tree.body.children[0].child.type,
    "singleChildScrollView",
  );
});
test("wrap choices include all compatible catalog content slots and adapt bounded layouts", () => {
  const button = wrapWidget(tree(), "text", "filledButton");
  assert.equal(
    nodes(button.tree).find((n) => n.id === button.id).child.id,
    "text",
  );
  const tooltip = wrapWidget(tree(), "box", "tooltip");
  assert.equal(
    nodes(tooltip.tree).find((n) => n.id === tooltip.id).child.id,
    "box",
  );
  const page = wrapWidget(tree(), "box", "pageView");
  assert.equal(page.tree.body.children[0].type, "sizedBox");
  assert.equal(page.tree.body.children[0].child.children[0].id, "box");
});

test("icons retain real names and convert to buttons with preserved appearance", () => {
  assert.equal(widget("icon").name, "star");
  assert.equal(designerField({ key: "name", kind: "text" }, "icon"), true);
  const root = {
    type: "column",
    id: "root",
    children: [
      {
        type: "icon",
        id: "icon",
        name: "favorite",
        size: 32,
        color: "@theme.primary",
      },
    ],
  };
  const icon = replaceWidget(root, "icon", "iconButton").children[0];
  assert.equal(icon.id, "icon");
  assert.equal(icon.icon, "favorite");
  assert.equal(icon.iconSize, 32);
  assert.equal(icon.iconColor, "@theme.primary");
  assert.equal(icon.action, undefined);
  assert.equal(
    parseProperty("@theme.primary", { kind: "color" }),
    "@theme.primary",
  );
  assert.equal(widget("refreshIndicator").onRefresh.type, "refresh");
});
test("replacing interactive widgets preserves their configured actions instead of demo actions", () => {
  const action = {
    type: "navigate",
    source: "/runtime/screens/profile",
    arguments: { id: "{{item.id}}" },
  };
  const tree = {
    type: "column",
    id: "root",
    children: [
      {
        type: "filledButton",
        id: "button",
        text: "Profile",
        onPressed: action,
      },
    ],
  };
  const replaced = replaceWidget(tree, "button", "iconButton").children[0];
  assert.deepEqual(replaced.action, action);
  assert.equal(replaced.onPressed, undefined);
  const text = {
    type: "column",
    id: "root",
    children: [{ type: "text", id: "text", text: "Continue" }],
  };
  assert.equal(
    replaceWidget(text, "text", "filledButton").children[0].action,
    undefined,
  );
});

test("created themes, dark appearance and fonts publish atomically and preview the matching release", async (t) => {
  const f = await fixture(t);
  const theme = {
    seedColor: "#112233",
    primaryColor: "#0066ff",
    secondaryColor: "#ff6600",
    backgroundColor: "#fafafa",
    fontFamily: "Example",
    fontSize: 16,
    borderRadius: 12,
  };
  const created = await f.call(
    "POST",
    "/api/apps",
    {
      name: "Themed app",
      theme,
      themeMode: "dark",
      darkTheme: { primaryColor: "#99bbff" },
    },
    f.admin,
  );
  assert.equal(created.status, 201);
  assert.deepEqual(created.data.draft.theme, theme);
  assert.equal(created.data.draft.themeMode, "dark");
  const doc = structuredClone(f.app.draft);
  Object.assign(doc, {
    theme: structuredClone(theme),
    themeMode: "dark",
    darkTheme: { primaryColor: "#99bbff" },
  });
  assert.equal((await f.save(doc)).status, 200);
  assert.equal((await f.publish()).status, 200);
  const live = (await f.call("GET", "/runtime/start", undefined, f.runtime))
    .data;
  assert.deepEqual(live.theme, theme);
  assert.equal(live.themeMode, "dark");
  assert.deepEqual(live.darkTheme, { primaryColor: "#99bbff" });
  doc.theme.primaryColor = "#ff8800";
  await f.save(doc);
  const preview = (
    await f.call(
      "POST",
      `/api/apps/${f.app.id}/preview`,
      { source: "published", screenId: doc.initialScreen },
      f.admin,
    )
  ).data;
  assert.deepEqual(preview.theme, theme);
  assert.equal(preview.themeMode, "dark");
  const draft = (
    await f.call(
      "POST",
      `/api/apps/${f.app.id}/preview`,
      { document: doc, screenId: doc.initialScreen },
      f.admin,
    )
  ).data;
  assert.equal(draft.theme.primaryColor, "#ff8800");
  const csp = (await f.server.inject({ url: "/health" })).headers[
    "content-security-policy"
  ];
  assert.match(csp, /connect-src[^;]*https:/);
});

test("invalid app themes and font files fail before saving or creating an app", async (t) => {
  const f = await fixture(t);
  for (const config of [
    { theme: { primaryColor: "invalid" } },
    { theme: { fontSize: -4 } },
    { themeMode: "invalid" },
    {
      theme: { fonts: [{ family: "Bad", data: "data:font/ttf;base64,YmFk" }] },
    },
  ]) {
    assert.equal(
      (
        await f.call(
          "POST",
          "/api/apps",
          { name: "Invalid", ...config },
          f.admin,
        )
      ).status,
      400,
    );
  }
});

test("bottom-sheet actions are not mistaken for widget layers, while their content remains editable", async () => {
  const { nodes } = await import("../web/model.js");
  const tree = {
    type: "filledButton",
    id: "trigger",
    action: {
      type: "bottomSheet",
      id: "open-action",
      content: { type: "text", id: "sheet-copy", text: "Hello" },
    },
  };
  assert.deepEqual(
    nodes(tree).map((node) => node.id),
    ["trigger", "sheet-copy"],
  );
});
