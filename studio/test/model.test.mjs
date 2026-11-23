import test from "node:test";
import assert from "node:assert/strict";
import {
  insertInto,
  hydrate,
  nodes,
  widget,
  updateNode,
  moveSibling,
} from "../web/model.js";
import { starter } from "../server/starter.mjs";
import { widgetTypes } from "../server/schema.mjs";
test("insertion descends through scaffold/safe area and preserves an existing scrolling layout", () => {
  const tree = hydrate(starter("connection"), widgetTypes).screens[0].tree;
  const count = tree.body.child.children.length,
    child = widget("text");
  const added = insertInto(tree, null, child);
  assert.equal(added.body.type, "safeArea");
  assert.equal(added.body.child.type, "listView");
  assert.equal(added.body.child.children.length, count + 1);
  assert.equal(added.body.child.children.at(-1).id, child.id);
  assert.equal(tree.body.child.children.length, count);
});
test("explicit parents, supplied IDs, sibling reorder and removal preserve the tree", () => {
  const tree = {
    type: "column",
    id: "parent",
    children: [
      { type: "text", id: "first", text: "First" },
      { type: "text", id: "second", text: "Second" },
    ],
  };
  assert.equal(nodes(tree).length, 3);
  const added = insertInto(tree, "parent", widget("text"));
  assert.equal(added.children.length, 3);
  assert.equal(moveSibling(added, "second", -1).children[0].id, "second");
  const removed = updateNode(added, "first", () => null);
  assert.equal(removed.children.length, 2);
});
