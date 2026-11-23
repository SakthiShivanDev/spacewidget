import {
  existsSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { databaseConfig, openStore } from "../server/store.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL;
const schema = process.env.STUDIO_DATABASE_SCHEMA || "spacewidget";
if (
  !/^[a-z][a-z0-9_]{0,62}$/.test(schema) ||
  ["public", "information_schema"].includes(schema) ||
  schema.startsWith("pg_")
)
  throw new Error("Refusing to reset a system or shared public schema.");
const options = {
  tls: process.env.STUDIO_DATABASE_TLS === "false" ? false : undefined,
  ca: process.env.STUDIO_DATABASE_CA,
};
const client = new pg.Client(databaseConfig(url, options));
await client.connect();
try {
  const tables = (
    await client.query("SELECT tablename FROM pg_tables WHERE schemaname=$1", [
      schema,
    ])
  ).rows;
  if (!process.argv.includes("--confirm-reset")) {
    console.log(
      `Studio schema has ${tables.length} tables. Stop Studio, then use --confirm-reset to back up and remove all Studio accounts, apps, credentials and managed records. External connected databases are excluded.`,
    );
    process.exitCode = 0;
  } else {
    const externalReference = await client.query(
      `
      SELECT 1 FROM pg_constraint c
      JOIN pg_class target ON target.oid=c.confrelid JOIN pg_namespace tn ON tn.oid=target.relnamespace
      JOIN pg_class source ON source.oid=c.conrelid JOIN pg_namespace sn ON sn.oid=source.relnamespace
      WHERE c.contype='f' AND tn.nspname=$1 AND sn.nspname<>$1
      UNION ALL
      SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON d.classid='pg_rewrite'::regclass AND d.objid=r.oid
      JOIN pg_class source ON source.oid=r.ev_class JOIN pg_namespace sn ON sn.oid=source.relnamespace
      JOIN pg_class target ON d.refclassid='pg_class'::regclass AND target.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=target.relnamespace
      WHERE tn.nspname=$1 AND sn.nspname<>$1 LIMIT 1`,
      [schema],
    );
    if (externalReference.rowCount)
      throw new Error(
        "Reset refused: another schema has a foreign key or view depending on Studio. Separate those dependencies before resetting Studio.",
      );
    const directory = resolve(process.env.STUDIO_DATA_DIR || "data", "backups");
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const file = join(
      directory,
      `before-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`,
    );
    const uri = new URL(url);
    writeFileSync(file, "", { mode: 0o600, flag: "wx" });
    uri.searchParams.set(
      "sslmode",
      databaseConfig(url, options).ssl ? "verify-full" : "disable",
    );
    const dump = spawnSync(
      process.env.PG_DUMP_BIN ||
        (process.env.PG_BIN ? join(process.env.PG_BIN, "pg_dump") : "pg_dump"),
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        `--schema=${schema}`,
        `--file=${file}`,
      ],
      {
        env: {
          ...process.env,
          PGHOST: uri.hostname.replace(/^\[|\]$/g, ""),
          PGPORT: uri.port || "5432",
          PGUSER: decodeURIComponent(uri.username),
          PGPASSWORD: decodeURIComponent(uri.password),
          PGDATABASE: decodeURIComponent(uri.pathname.slice(1)),
          PGSSLMODE: uri.searchParams.get("sslmode"),
        },
        encoding: "utf8",
      },
    );
    if (dump.status !== 0)
      throw new Error(
        "PostgreSQL backup failed; database was not reset. Check pg_dump and database TLS configuration.",
      );
    chmodSync(file, 0o600);
    const check = spawnSync(
      process.env.PG_RESTORE_BIN ||
        (process.env.PG_BIN
          ? join(process.env.PG_BIN, "pg_restore")
          : "pg_restore"),
      ["--list", file],
      { stdio: "ignore" },
    );
    if (check.status !== 0)
      throw new Error(
        "PostgreSQL backup validation failed; database was not reset.",
      );
    // Only the explicitly configured Studio schema. Never traverse saved connections.
    await client.query("BEGIN");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query("COMMIT");
    const store = await openStore(url, { ...options, schema });
    await store.close();
    const marker = resolve(
      process.env.STUDIO_DATA_DIR || "data",
      "commerce-demo.json",
    );
    if (existsSync(marker)) {
      renameSync(marker, `${file}.commerce-demo.json`);
      chmodSync(`${file}.commerce-demo.json`, 0o600);
    }
    console.log(
      `Studio data reset. Recovery backup: ${file}. The first-run page will create a new owner. Server environment configuration was preserved.`,
    );
  }
} finally {
  await client.end();
}
