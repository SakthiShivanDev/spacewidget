import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { testStoreOptions, dropTestStore } from "./database.mjs";
import { openStore } from "../server/store.mjs";

test("one-time SQLite import preserves values and owner order, verifies checksums and refuses nonempty PostgreSQL targets", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "sw-import-test-")),
    database = await testStoreOptions();
  t.after(async () => {
    await dropTestStore(database);
    rmSync(directory, { recursive: true, force: true });
  });
  const sourcePath = join(directory, "old.sqlite"),
    source = new DatabaseSync(sourcePath);
  source.exec(
    `CREATE TABLE admins(id TEXT PRIMARY KEY,email TEXT UNIQUE,password TEXT); CREATE TABLE apps(id TEXT PRIMARY KEY,owner TEXT REFERENCES admins(id),name TEXT,draft TEXT,revision INTEGER,published INTEGER,created TEXT); CREATE TABLE m_abc_products(id TEXT PRIMARY KEY,price REAL,name TEXT);`,
  );
  source
    .prepare("INSERT INTO admins VALUES(?,?,?)")
    .run("z-owner", "owner@example.com", "original-password-hash");
  source
    .prepare("INSERT INTO admins VALUES(?,?,?)")
    .run("a-builder", "builder@example.com", "second-password-hash");
  source
    .prepare("INSERT INTO apps VALUES(?,?,?,?,?,?,?)")
    .run(
      "abc",
      "z-owner",
      "Original app",
      '{"screens":[]}',
      9,
      7,
      "2026-11-22",
    );
  source
    .prepare("INSERT INTO m_abc_products VALUES(?,?,?)")
    .run("product", 42.5, "Original product");
  source.close();
  const run = () =>
    new Promise((resolvePromise, reject) => {
      const process = spawn(
        globalThis.process.execPath,
        [resolve("scripts/migrate-sqlite.mjs"), sourcePath],
        {
          cwd: directory,
          env: {
            ...globalThis.process.env,
            STUDIO_DATABASE_URL: database.databaseUrl,
            STUDIO_DATABASE_SCHEMA: database.schema,
            STUDIO_DATABASE_TLS: "false",
            STUDIO_DATA_DIR: directory,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      process.stdout.on("data", (chunk) => (output += chunk));
      process.stderr.on("data", (chunk) => (output += chunk));
      process.on("error", reject);
      process.on("exit", (code) => resolvePromise({ code, output }));
    });
  const migrated = await run();
  assert.equal(migrated.code, 0, migrated.output);
  const target = await openStore(database.databaseUrl, {
    schema: database.schema,
    tls: false,
  });
  try {
    assert.equal(
      (await target.one("SELECT id FROM admins ORDER BY ordinal LIMIT 1")).id,
      "z-owner",
    );
    assert.equal(
      (await target.one("SELECT password FROM admins WHERE id=?", "z-owner"))
        .password,
      "original-password-hash",
    );
    assert.deepEqual(
      await target.one(
        "SELECT revision,published,draft FROM apps WHERE id=?",
        "abc",
      ),
      { revision: 9, published: 7, draft: '{"screens":[]}' },
    );
    assert.equal(
      (await target.one("SELECT price FROM m_abc_products")).price,
      42.5,
    );
    const reports = readdirSync(join(directory, "backups")).filter((p) =>
      p.endsWith(".json"),
    );
    assert.equal(reports.length, 1);
    const report = JSON.parse(
      readFileSync(join(directory, "backups", reports[0])),
    );
    assert.equal(report.tables.length, 3);
    assert.ok(
      report.tables.every((table) => /^[a-f0-9]{64}$/.test(table.checksum)),
    );
    const refused = await run();
    assert.notEqual(refused.code, 0);
    assert.match(refused.output, /Target schema must be empty/);
    assert.equal(
      (await target.one("SELECT COUNT(*) AS count FROM apps")).count,
      1,
    );
  } finally {
    await target.close();
  }
});
