import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { crc32 } from "node:zlib";
import {
  parseFigmaPackage,
  figmaFrameTree,
  applyFigmaImport,
  classifyFigmaClipboard,
  snapshotPackage,
  pngDimensions,
  FIGMA_MAX_BYTES,
} from "../web/figma-import.js";
import { nodes } from "../web/model.js";
import { parseDefinition, expandTree, widgetTypes } from "../server/schema.mjs";
import { fixture } from "./helpers.mjs";
const exported = JSON.parse(
  readFileSync(new URL("./fixtures/figma-design.json", import.meta.url)),
);
const makeDoc = () => ({
  schemaVersion: 1,
  initialScreen: "main",
  theme: { seedColor: "#1674e8" },
  screens: [
    {
      id: "main",
      name: "Main",
      public: true,
      state: { count: 4 },
      queries: [],
      tree: {
        type: "scaffold",
        id: "main-root",
        body: { type: "column", id: "layout", children: [] },
      },
    },
  ],
  components: [],
  actions: [],
});

test("Figma layers retain positions, literal text, colors, fonts and embedded artwork", () => {
  const parsed = parseFigmaPackage(exported),
    tree = figmaFrameTree(parsed.frames[0]);
  const all = nodes(tree),
    heading = all.find((n) => n.labelName === "Heading"),
    position = all.find((n) => n.labelName === "Heading position");
  assert.equal(heading.text, "Shop from Figma");
  assert.equal(heading.fontFamily, "Roboto");
  assert.equal(heading.color, "#FFFFFF");
  assert.equal(position.left, 40);
  assert.equal(position.top, 42);
  assert.equal(position.width, 280);
  assert.equal(
    all.find((n) => n.labelName === "API placeholder").literal,
    true,
  );
  assert.equal(
    all.find((n) => n.labelName === "Artwork").src,
    exported.frames[0].preview,
  );
  assert.equal(new Set(all.map((n) => n.id)).size, all.length);
  assert.ok(all.every((n) => widgetTypes.includes(n.type)));
  assert.equal(tree.width, 390);
  assert.equal(tree.height, 300);
});
test("snapshot imports preserve the exported image and do not pretend to provide editable layers", () => {
  const parsed = parseFigmaPackage(snapshotPackage(exported.frames[0].preview));
  assert.equal(parsed.frames[0].width, 4);
  assert.throws(
    () => figmaFrameTree(parsed.frames[0], "editable"),
    /no editable layers/,
  );
  const all = nodes(figmaFrameTree(parsed.frames[0], "snapshot"));
  assert.equal(all.filter((n) => n.type === "image").length, 1);
  assert.equal(
    all.some((n) => n.type === "text"),
    false,
  );
  assert.deepEqual(pngDimensions(exported.frames[0].preview), {
    width: 4,
    height: 4,
  });
});
test("imports add screens and components without modifying existing data/actions; replacement and insertion are explicit", () => {
  const original = makeDoc(),
    serialized = JSON.stringify(original);
  for (const destination of ["screen", "component", "replace", "insert"]) {
    const result = applyFigmaImport(original, exported, {
      destination,
      screenId: "main",
      selected: "layout",
    });
    assert.equal(JSON.stringify(original), serialized);
    assert.equal(result.document.screens[0].state.count, 4);
    assert.deepEqual(result.document.actions, []);
    assert.doesNotThrow(() => parseDefinition(result.document));
    if (destination === "screen") {
      assert.equal(result.document.screens.length, 2);
      assert.equal(result.document.screens[0].tree.id, "main-root");
    }
    if (destination === "component")
      assert.equal(result.document.components.length, 1);
    if (destination === "insert")
      assert.equal(result.document.screens[0].tree.body.children.length, 1);
  }
  const once = applyFigmaImport(original, exported).document,
    twice = applyFigmaImport(once, exported).document;
  assert.notEqual(twice.screens[1].id, twice.screens[2].id);
});
test("untrusted clipboard content cannot inject actions, arbitrary resources or invalid geometry", () => {
  const raw = structuredClone(exported);
  raw.frames[0].root.children[1].action = {
    type: "request",
    source: "https://attacker.invalid",
  };
  raw.frames[0].root.children[1].children = [
    { type: "webView", src: "javascript:alert(1)" },
  ];
  const tree = figmaFrameTree(parseFigmaPackage(raw).frames[0]);
  assert.ok(!JSON.stringify(tree).includes("attacker"));
  assert.ok(!JSON.stringify(tree).includes("javascript:"));
  for (const value of [Infinity, -1, "390", null]) {
    const invalid = structuredClone(exported);
    invalid.frames[0].width = value;
    assert.throws(() => parseFigmaPackage(invalid));
  }
  const external = structuredClone(exported);
  external.frames[0].preview = "https://example.com/image.png";
  assert.throws(() => parseFigmaPackage(external), /embedded PNG/);
  assert.throws(
    () => pngDimensions("data:image/png;base64,AAAA"),
    /Invalid PNG/,
  );
  assert.throws(
    () => parseFigmaPackage("x".repeat(FIGMA_MAX_BYTES + 1)),
    /too large/,
  );
  assert.throws(
    () =>
      parseFigmaPackage({
        format: "spacewidget-figma",
        version: 10,
        frames: [],
      }),
    /not a supported/,
  );
});
test("clipboard classification distinguishes the plugin, native Figma data and ordinary application text", () => {
  assert.equal(classifyFigmaClipboard(JSON.stringify(exported)), "package");
  assert.equal(
    classifyFigmaClipboard(
      "Design",
      "<!--(figmeta)private(/figmeta)--><!--(figma)private(/figma)-->",
    ),
    "native",
  );
  assert.equal(
    classifyFigmaClipboard("https://www.figma.com/design/abc?node-id=1-2"),
    "native",
  );
  assert.equal(classifyFigmaClipboard("Hello user"), null);
});
test("the actual companion plugin exports selected layers and rasterizes unsupported artwork without network access", async () => {
  const messages = [],
    bytes = Uint8Array.from(
      Buffer.from(exported.frames[0].preview.split(",")[1], "base64"),
    );
  const paint = { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 };
  const shape = {
    id: "shape",
    name: "Vector",
    type: "VECTOR",
    visible: true,
    absoluteBoundingBox: { x: 10, y: 20, width: 4, height: 4 },
    absoluteRenderBounds: { x: 10, y: 20, width: 4, height: 4 },
    fills: [],
    strokes: [],
    exportAsync: async () => bytes,
  };
  const text = {
    id: "text",
    name: "Title",
    type: "TEXT",
    visible: true,
    absoluteBoundingBox: { x: 20, y: 40, width: 70, height: 30 },
    fills: [paint],
    strokes: [],
    fontName: { family: "Inter", style: "Bold" },
    fontSize: 20,
    fontWeight: 700,
    characters: "Design title",
    lineHeight: { unit: "PIXELS", value: 24 },
    letterSpacing: { unit: "PERCENT", value: 2 },
    textAlignVertical: "TOP",
    textAlignHorizontal: "CENTER",
    textDecoration: "NONE",
  };
  const handlers = {};
  const frame = {
    id: "frame",
    name: "Selection",
    type: "FRAME",
    visible: true,
    fills: [paint],
    strokes: [],
    cornerRadius: 0,
    clipsContent: true,
    absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 200 },
    children: [shape, text],
    exportAsync: async (options) => {
      assert.equal(options.format, "PNG");
      assert.equal(options.colorProfile, "SRGB");
      return bytes;
    },
  };
  shape.parent = frame;
  text.parent = frame;
  const figma = {
    currentPage: { selection: [frame, shape] },
    showUI() {},
    on(type, handler) {
      handlers[type] = handler;
    },
    base64Encode: (v) => Buffer.from(v).toString("base64"),
    ui: { postMessage: (m) => messages.push(m) },
  };
  vm.runInNewContext(
    readFileSync(new URL("../figma-plugin/code.js", import.meta.url), "utf8"),
    { figma, __html__: "<html></html>" },
  );
  await figma.ui.onmessage({ type: "export" });
  const completed = messages.find((m) => m.type === "exported");
  assert.ok(completed, JSON.stringify(messages));
  const imported = parseFigmaPackage(completed.text);
  assert.equal(imported.frames.length, 1);
  assert.equal(imported.frames[0].root.children[0].kind, "raster");
  assert.equal(imported.frames[0].root.children[0].x, 10);
  assert.ok(imported.warnings.some((w) => w.includes("vector artwork")));
  const title = imported.frames[0].root.children[1];
  assert.equal(title.kind, "text");
  assert.equal(title.text, "Design title");
  assert.equal(title.lineHeight, 1.2);
  assert.equal(title.letterSpacing, 0.4);
  assert.equal(title.textAlign, "center");
  assert.deepEqual(imported.fonts, ["Inter"]);
  messages.length = 0;
  await figma.ui.onmessage({ type: "export", snapshotOnly: true });
  const snapshot = parseFigmaPackage(
    messages.find((m) => m.type === "exported").text,
  );
  assert.equal(snapshot.frames[0].root, undefined);
  messages.length = 0;
  frame.exportAsync = async () => {
    handlers.selectionchange();
    return bytes;
  };
  await figma.ui.onmessage({ type: "export" });
  assert.ok(
    messages.some(
      (m) => m.type === "error" && /selection changed/.test(m.message),
    ),
  );
  assert.ok(!messages.some((m) => m.type === "exported"));
  assert.deepEqual(
    JSON.parse(
      readFileSync(new URL("../figma-plugin/manifest.json", import.meta.url)),
    ).networkAccess.allowedDomains,
    ["none"],
  );
});
test("plugin download is authenticated, contains a valid ZIP and excludes application secrets", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call("GET", "/api/figma-plugin")).status, 401);
  const response = await f.server.inject({
    url: "/api/figma-plugin",
    headers: f.admin,
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /application\/zip/);
  const zip = response.rawPayload;
  const names = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18),
      nameLength = zip.readUInt16LE(offset + 26),
      name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const body = zip.subarray(
      offset + 30 + nameLength,
      offset + 30 + nameLength + size,
    );
    assert.equal(crc32(body), zip.readUInt32LE(offset + 14));
    names.push(name);
    assert.ok(!body.toString().includes("STUDIO_MASTER_KEY"));
    offset += 30 + nameLength + size;
  }
  assert.deepEqual(names.sort(), [
    "README.txt",
    "code.js",
    "manifest.json",
    "ui.html",
  ]);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
test("an imported screen persists and renders through the existing published runtime API", async (t) => {
  const f = await fixture(t),
    result = applyFigmaImport(f.app.draft, exported);
  result.document.screens.find((s) => s.id === result.entityId).public = true;
  const saved = await f.save(result.document);
  assert.equal(saved.status, 200);
  assert.equal((await f.publish()).status, 200);
  const runtime = await f.call(
    "GET",
    `/runtime/screens/${result.entityId}`,
    undefined,
    f.runtime,
  );
  assert.equal(runtime.status, 200);
  assert.ok(JSON.stringify(runtime.data.widgets).includes("Shop from Figma"));
  assert.ok(
    JSON.stringify(runtime.data.widgets).includes("data:image/png;base64,"),
  );
});

test("generated wrapper depth is checked before draft mutation and literal component design copy survives expansion", () => {
  const original = makeDoc(),
    raw = structuredClone(exported);
  let root = raw.frames[0].root;
  for (let i = 0; i < 22; i++)
    root = {
      kind: "frame",
      name: "Nested frame",
      width: 390,
      height: 300,
      children: [root],
    };
  raw.frames[0].root = root;
  assert.doesNotThrow(() => parseFigmaPackage(raw));
  assert.throws(() => applyFigmaImport(original, raw), /rendering limit/);
  assert.equal(original.screens.length, 1);
  const literal = structuredClone(exported);
  literal.frames[0].root.children[1].text = "{{props.title}}";
  const imported = applyFigmaImport(original, literal, {
    destination: "component",
  });
  const component = imported.document.components[0];
  component.defaults = { title: "Must not replace the literal design" };
  const expanded = expandTree(
    { type: "component", componentId: component.id },
    imported.document,
  );
  assert.equal(
    nodes(expanded).find((n) => n.labelName === "Heading").text,
    "{{props.title}}",
  );
  assert.equal(
    expandTree(
      { type: "component", componentId: "dynamic" },
      {
        components: [
          {
            id: "dynamic",
            defaults: { title: "Dynamic heading" },
            tree: { type: "text", text: "{{props.title}}" },
          },
        ],
      },
    ).text,
    "Dynamic heading",
  );
});
