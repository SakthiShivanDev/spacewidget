import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fixture } from "./helpers.mjs";

test("explicit Studio reset creates a private PostgreSQL backup, removes accounts and managed records and returns to setup", async (t) => {
  const f = await fixture(t),
    directory = mkdtempSync(join(tmpdir(), "sw-reset-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const run = (args) =>
    new Promise((resolveResult, reject) => {
      const child = spawn(
        process.execPath,
        [resolve("scripts/reset-database.mjs"), ...args],
        {
          cwd: directory,
          env: {
            ...process.env,
            STUDIO_DATABASE_URL: f.server.store.pool.options.connectionString,
            STUDIO_DATABASE_SCHEMA: f.server.store.schema,
            STUDIO_DATABASE_TLS: "false",
            STUDIO_DATA_DIR: directory,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      child.stdout.on("data", (data) => (output += data));
      child.stderr.on("data", (data) => (output += data));
      child.on("error", reject);
      child.on("exit", (code) => resolveResult({ code, output }));
    });
  assert.equal((await run([])).code, 0);
  assert.equal((await f.call("GET", "/api/setup")).data.required, false);
  const reset = await run(["--confirm-reset"]);
  assert.equal(reset.code, 0, reset.output);
  assert.equal((await f.call("GET", "/api/setup")).data.required, true);
  for (const table of [
    "admins",
    "apps",
    "runtime_users",
    "http_services",
    "notifications",
    "code_modules",
    "runtime_keys",
  ])
    assert.equal(
      (await f.server.store.one(`SELECT COUNT(*) AS count FROM ${table}`))
        .count,
      0,
      table,
    );
  assert.equal(
    (
      await f.server.store.all(
        "SELECT tablename FROM pg_tables WHERE schemaname=? AND tablename LIKE 'm_%'",
        f.server.store.schema,
      )
    ).length,
    0,
  );
  const files = readdirSync(join(directory, "backups"));
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith(".dump"));
  assert.equal(
    statSync(join(directory, "backups", files[0])).mode & 0o777,
    0o600,
  );
  assert.ok(statSync(join(directory, "backups", files[0])).size > 1000);
});
