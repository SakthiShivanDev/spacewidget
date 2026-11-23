import { testStoreOptions, dropTestStore } from "./database.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../server/app.mjs";

test("a stale preview copied into web dist cannot shadow the current Flutter build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "spacewidget-preview-assets-"));
  const webRoot = join(dir, "dist"),
    previewRoot = join(dir, "current-preview");
  let server;
  try {
    await mkdir(join(webRoot, "flutter-preview"), { recursive: true });
    await mkdir(previewRoot, { recursive: true });
    await writeFile(join(webRoot, "index.html"), "Studio editor");
    await writeFile(
      join(webRoot, "flutter-preview", "main.dart.js"),
      "stale renderer",
    );
    await writeFile(join(previewRoot, "main.dart.js"), "current grid renderer");
    await writeFile(join(previewRoot, "index.html"), "Flutter preview");
    await writeFile(join(previewRoot, "flutter_bootstrap.js"), "boot Flutter");
    server = await createServer({
      ...(await testStoreOptions()),
      masterKey: "5".repeat(64),
      setupToken: "preview-assets-test-setup-token",
      webRoot,
      previewRoot,
    });
    assert.equal((await server.inject({ url: "/" })).body, "Studio editor");
    const response = await server.inject({
      url: "/flutter-preview/main.dart.js",
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "current grid renderer");
    assert.match(response.headers["content-type"], /javascript/);
    assert.equal(response.headers["cache-control"], "no-cache");
    assert.equal(
      (await server.inject({ url: "/flutter-preview/" })).body,
      "Flutter preview",
    );
    assert.equal(
      (await server.inject({ url: "/flutter-preview/flutter_bootstrap.js" }))
        .body,
      "boot Flutter",
    );
    const missing = await server.inject({ url: "/flutter-preview/missing.js" });
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().success, false);
    // Reloading the native canvas cannot exhaust the API's global limit.
    for (let i = 0; i < 305; i++)
      assert.equal(
        (await server.inject({ url: "/flutter-preview/main.dart.js" }))
          .statusCode,
        200,
      );
    assert.equal((await server.inject({ url: "/api/setup" })).statusCode, 200);
  } finally {
    await server?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
