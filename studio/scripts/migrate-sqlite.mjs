// One-time, read-only import utility. The running Studio never loads SQLite.
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, chmodSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { openStore } from "../server/store.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
const sourcePath = resolve(
  process.argv[2] || process.env.STUDIO_DB || "data/studio.sqlite",
);
if (!existsSync(sourcePath))
  throw new Error("SQLite source does not exist. Pass its path explicitly.");
const directory = resolve(process.env.STUDIO_DATA_DIR || "data", "backups");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const snapshot = join(directory, `pre-postgres-${stamp}.sqlite`);
const source = new DatabaseSync(sourcePath, { readOnly: true });
await backup(source, snapshot);
chmodSync(snapshot, 0o600);
const target = await openStore(undefined, {
  tls: process.env.STUDIO_DATABASE_TLS === "false" ? false : undefined,
});
const quote = (value) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value))
    throw new Error("Unsupported source identifier.");
  return `"${value}"`;
};
const digest = (rows) =>
  createHash("sha256")
    .update(JSON.stringify(rows.map((row) => JSON.stringify(row)).sort()))
    .digest("hex");
try {
  const tables = source
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .all();
  const remaining = new Map(tables.map((table) => [table.name, table]));
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((table) =>
      source
        .prepare(`PRAGMA foreign_key_list(${quote(table.name)})`)
        .all()
        .every((fk) => !remaining.has(fk.table) || fk.table === table.name),
    );
    if (!ready.length)
      throw new Error(
        "Circular source table dependencies require a manual migration.",
      );
    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table.name);
    }
  }
  const report = [];
  await target.transaction(async () => {
    for (const table of await target.all(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name <> 'schema_migrations'",
      target.schema,
    )) {
      if (
        (
          await target.one(
            `SELECT COUNT(*) AS count FROM ${quote(table.table_name)}`,
          )
        ).count
      )
        throw new Error(
          "Target schema must be empty. Existing PostgreSQL data was not changed.",
        );
    }
    for (const table of ordered) {
      const exists = await target.one(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name=?",
        target.schema,
        table.name,
      );
      if (!exists) {
        if (!/^m_[a-z0-9]+_[a-z_]+$/.test(table.name))
          throw new Error(`Unsupported source table: ${table.name}`);
        await target.exec(
          table.sql
            .replace(/\bREAL\b/gi, "DOUBLE PRECISION")
            .replace(/\bINTEGER\b/gi, "BIGINT"),
        );
      }
      const columns = source
        .prepare(`PRAGMA table_info(${quote(table.name)})`)
        .all()
        .map((c) => c.name);
      const select = columns.map(quote).join(",");
      const rows = source
        .prepare(`SELECT ${select} FROM ${quote(table.name)} ORDER BY rowid`)
        .all()
        .map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
      for (const row of rows)
        await target.run(
          `INSERT INTO ${quote(table.name)}(${select}) VALUES(${columns.map(() => "?").join(",")})`,
          ...columns.map((c) => row[c]),
        );
      const copied = (
        await target.all(`SELECT ${select} FROM ${quote(table.name)}`)
      ).map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
      const checksum = digest(rows);
      if (rows.length !== copied.length || checksum !== digest(copied))
        throw new Error(
          `Verification failed for ${table.name}. Import rolled back.`,
        );
      report.push({ table: table.name, count: rows.length, checksum });
    }
  });
  const output = join(directory, `postgres-import-${stamp}.json`);
  writeFileSync(
    output,
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        sourceSnapshot: snapshot,
        tables: report,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `Imported and checksum-verified ${report.length} tables. Source preserved; backup and report saved in data/backups.`,
  );
} finally {
  source.close();
  await target.close();
}
