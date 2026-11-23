import { testStoreOptions, dropTestStore } from "./database.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { addProductGrid } from "../components/product-grid.mjs";
import { starter } from "../server/starter.mjs";
import { expandTree, widgetTypes } from "../server/schema.mjs";
import { hydrate, nodes } from "../web/model.js";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { openStore } from "../server/store.mjs";

test("product grid replaces the product list while preserving existing screen data and other widgets", () => {
  const original = hydrate(starter("connection"), widgetTypes);
  const before = structuredClone(original);
  const doc = addProductGrid(original);
  assert.deepEqual(original, before);
  assert.equal(doc.components.at(-1).name, "Product grid");
  assert.deepEqual(doc.screens[0].queries, before.screens[0].queries);
  assert.deepEqual(doc.screens[1], before.screens[1]);
  assert.equal(
    nodes(doc.screens[0].tree).filter(
      (node) => node.componentId === "product-grid",
    ).length,
    1,
  );
  assert.equal(
    nodes(doc.screens[0].tree).filter((node) => node.type === "repeat").length,
    0,
  );
  const tree = nodes(expandTree(doc.screens[0].tree, doc)).find(
    (node) => node.type === "responsive",
  );
  assert.equal(tree.small.crossAxisCount, 2);
  assert.equal(tree.medium.crossAxisCount, 3);
  assert.equal(tree.large.crossAxisCount, 4);
  assert.equal(tree.small.items, "{{products}}");
  assert.ok(JSON.stringify(tree).includes("{{item.image_url}}"));
  assert.throws(() => addProductGrid(doc), /already exists/);
});
test("product grid instance overrides preserve typed data, price field mapping and per-product actions", () => {
  const doc = addProductGrid(starter("connection"));
  const instance = nodes(doc.screens[0].tree).find(
    (node) => node.componentId === "product-grid",
  );
  instance.values = {
    columns: 1,
    currency: "INR",
    priceField: "sale_price",
    onProductTap: {
      type: "navigate",
      source: "/runtime/screens/details",
      query: { id: "{{item.id}}" },
    },
  };
  const tree = nodes(expandTree(doc.screens[0].tree, doc)).find(
    (node) => node.type === "responsive",
  );
  assert.equal(tree.small.crossAxisCount, 1);
  assert.ok(JSON.stringify(tree.small).includes("INR {{item.sale_price}}"));
  assert.deepEqual(tree.small.template.child.action, {
    type: "navigate",
    source: "/runtime/screens/details",
    query: { id: "{{item.id}}" },
  });
});

test("operator installer backs up and updates one app draft without publishing or duplicating the component", async () => {
  const directory = await mkdtemp(join(tmpdir(), "spacewidget-grid-install-"));
  const pgOptions = await testStoreOptions();
  const database = pgOptions.databaseUrl;
  const original = JSON.stringify(starter("connection"));
  try {
    const store = await openStore(database, {
      schema: pgOptions.schema,
      tls: false,
    });
    await store.run(
      "INSERT INTO admins(id,email,password) VALUES(?,?,?)",
      "owner",
      "owner@example.com",
      "unused-test-password-hash",
    );
    await store.run(
      "INSERT INTO apps VALUES(?,?,?,?,1,NULL,?)",
      "app-grid-test",
      "owner",
      "Grid test",
      original,
      new Date().toISOString(),
    );
    await store.close();
    const run = () =>
      spawnSync(
        process.execPath,
        ["scripts/add-product-grid.mjs", "--app-id", "app-grid-test"],
        {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          env: {
            ...process.env,
            STUDIO_DATABASE_URL: database,
            STUDIO_DATABASE_SCHEMA: pgOptions.schema,
            STUDIO_DATABASE_TLS: "false",
            STUDIO_DATA_DIR: directory,
          },
          encoding: "utf8",
        },
      );
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const saved = await openStore(database, {
      schema: pgOptions.schema,
      tls: false,
    });
    try {
      const app = await saved.one(
        "SELECT * FROM apps WHERE id=?",
        "app-grid-test",
      );
      assert.equal(app.revision, 2);
      assert.equal(app.published, null);
      assert.ok(
        JSON.parse(app.draft).components.some(
          (item) => item.id === "product-grid",
        ),
      );
      assert.equal(
        (await saved.one("SELECT COUNT(*) AS count FROM audit")).count,
        1,
      );
    } finally {
      await saved.close();
    }
    const backup = join(directory, "backups", "app-grid-test-revision-1.json");
    assert.equal(await readFile(backup, "utf8"), original);
    assert.equal((await stat(backup)).mode & 0o777, 0o600);
    assert.notEqual(run().status, 0);
  } finally {
    await dropTestStore(pgOptions);
    await rm(directory, { recursive: true, force: true });
  }
});
