import pg from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { applyMigrations } from "./migrations.mjs";

export function databaseConfig(url, { tls, ca, production = false } = {}) {
  let uri;
  try {
    uri = new URL(url);
  } catch {
    throw new Error(
      "Set STUDIO_DATABASE_URL (or DATABASE_URL) to a PostgreSQL connection URL.",
    );
  }
  if (!["postgres:", "postgresql:"].includes(uri.protocol) || !uri.hostname)
    throw new Error(
      "Studio requires PostgreSQL. SQLite files and in-memory SQLite are not supported.",
    );
  const local = ["localhost", "127.0.0.1", "[::1]", "postgres"].includes(
    uri.hostname,
  );
  const sslMode = uri.searchParams.get("sslmode");
  const secure = sslMode ? sslMode !== "disable" : (tls ?? !local);
  if (production && !local && !secure)
    throw new Error(
      "Remote PostgreSQL connections require verified TLS in production.",
    );
  if ([...uri.searchParams.keys()].some((key) => key !== "sslmode"))
    throw new Error(
      "Use sslmode or explicit TLS settings for the Studio database URL.",
    );
  uri.search = "";
  return {
    connectionString: uri.toString(),
    ssl: secure ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
  };
}
// Keep literals intact while adapting internal positional SQL to node-postgres.
export function postgresSql(sql) {
  let index = 0;
  let result = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|\?/g, (value) =>
    value === "?" ? `$${++index}` : value,
  );
  if (/^\s*INSERT OR IGNORE\b/i.test(result))
    result =
      result.replace(/INSERT OR IGNORE/i, "INSERT") + " ON CONFLICT DO NOTHING";
  return result;
}
export async function openStore(
  url = process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL,
  options = {},
) {
  const schema =
    options.schema || process.env.STUDIO_DATABASE_SCHEMA || "spacewidget";
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid Studio PostgreSQL schema.");
  const config = databaseConfig(url, options);
  const types = new pg.TypeOverrides();
  types.setTypeParser(20, (value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new Error("Database integer exceeds JSON's safe integer range.");
    return number;
  });
  const pool = new pg.Pool({
    ...config,
    types,
    max: options.max || 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 15000,
    statement_timeout: 10000,
    application_name: "spacewidget-studio",
    options: `-c search_path=${schema},public`,
  });
  pool.on("error", () => {});
  const scope = new AsyncLocalStorage();
  const query = (sql, values = []) =>
    (scope.getStore() || pool).query(postgresSql(sql), values);
  const store = {
    kind: "postgres",
    schema,
    pool,
    async one(sql, ...values) {
      return (await query(sql, values)).rows[0];
    },
    async all(sql, ...values) {
      return (await query(sql, values)).rows;
    },
    async run(sql, ...values) {
      const result = await query(sql, values);
      return { changes: result.rowCount || 0, rows: result.rows };
    },
    async exec(sql) {
      return query(sql);
    },
    async transaction(fn) {
      if (scope.getStore()) return fn();
      for (let attempt = 0; ; attempt++) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
          const result = await scope.run(client, fn);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          if (!["40001", "40P01"].includes(error.code) || attempt >= 3)
            throw error;
        } finally {
          client.release();
        }
      }
    },
    async close() {
      await pool.end();
    },
  };
  store.db = { exec: store.exec };
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await store.transaction(async () => {
      await query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `spacewidget-migrations:${schema}`,
      ]);
      await applyMigrations(query);
    });
    return store;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
