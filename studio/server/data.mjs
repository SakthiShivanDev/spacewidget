import pg from "pg";
import { createHmac, randomUUID } from "node:crypto";
import { failure, identifier, equal, hash } from "./security.mjs";

export class DataService {
  constructor(
    store,
    vault,
    { allowedHosts = [], production = false, environmentDatabase = {} } = {},
  ) {
    this.store = store;
    this.vault = vault;
    this.pools = new Map();
    this.allowedHosts = allowedHosts;
    this.production = production;
    this.environmentDatabase = environmentDatabase;
  }
  resolveConfig(config) {
    if (config.env === undefined) return config;
    if (config.env !== "APP_DATABASE_URL" || !this.environmentDatabase.url)
      throw failure(
        503,
        "Set APP_DATABASE_URL in the server environment and restart Studio.",
      );
    let uri;
    try {
      uri = new URL(this.environmentDatabase.url);
    } catch {
      throw failure(400, "APP_DATABASE_URL must be a PostgreSQL URL.");
    }
    const sslMode = uri.searchParams.get("sslmode");
    if (
      [...uri.searchParams.keys()].some((key) => key !== "sslmode") ||
      (sslMode &&
        !["require", "verify-ca", "verify-full", "disable"].includes(sslMode))
    )
      throw failure(
        400,
        "Only sslmode is supported in APP_DATABASE_URL query options.",
      );
    uri.search = "";
    return {
      url: uri.toString(),
      tls: sslMode
        ? sslMode !== "disable"
        : this.environmentDatabase.tls !== false,
      ...(this.environmentDatabase.ca
        ? { ca: this.environmentDatabase.ca }
        : {}),
    };
  }
  config(connection) {
    return this.resolveConfig(this.vault.open(connection.config));
  }
  validatePostgres(config) {
    let uri;
    try {
      uri = new URL(config.url);
    } catch {
      throw failure(400, "A PostgreSQL connection URL is required.");
    }
    if (
      !["postgres:", "postgresql:"].includes(uri.protocol) ||
      !uri.hostname ||
      uri.search
    )
      throw failure(
        400,
        "Use a PostgreSQL URL without query options. Configure TLS separately.",
      );
    if (
      (this.production || this.allowedHosts.length) &&
      !this.allowedHosts.includes(uri.hostname)
    )
      throw failure(400, "Database host is not permitted by STUDIO_DB_HOSTS.");
    if (
      this.production &&
      config.tls === false &&
      !["localhost", "127.0.0.1", "postgres"].includes(uri.hostname)
    )
      throw failure(400, "TLS is required for remote production databases.");
  }
  pool(connection) {
    if (!this.pools.has(connection.id)) {
      const config = this.config(connection);
      this.validatePostgres(config);
      this.pools.set(
        connection.id,
        new pg.Pool({
          connectionString: config.url,
          ssl:
            config.tls === false
              ? false
              : {
                  rejectUnauthorized: true,
                  ...(config.ca ? { ca: config.ca } : {}),
                },
          max: 4,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 15000,
          statement_timeout: 5000,
          application_name: "spacewidget-studio",
        }),
      );
    }
    return this.pools.get(connection.id);
  }
  managedName(connection, table) {
    identifier(table);
    return identifier(`m_${connection.app_id}_${table}`);
  }
  async initializeManaged(connection, { seed = true } = {}) {
    const table = (name) => this.managedName(connection, name);
    await this.store.db
      .exec(`CREATE TABLE IF NOT EXISTS ${table("profiles")}(id TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL,name TEXT,email TEXT,avatar_url TEXT);
      CREATE TABLE IF NOT EXISTS ${table("products")}(id TEXT PRIMARY KEY,name TEXT,category TEXT,price DOUBLE PRECISION,stock INTEGER);
      CREATE TABLE IF NOT EXISTS ${table("notes")}(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,title TEXT,body TEXT,created_at TEXT);`);
    if (
      seed &&
      !(await this.store.one(`SELECT id FROM ${table("products")} LIMIT 1`))
    ) {
      for (const row of [
        ["p1", "Studio headphones", "Audio", 89, 24],
        ["p2", "Everyday backpack", "Accessories", 64, 18],
        ["p3", "Desk lamp", "Home", 42, 31],
      ])
        await this.store.run(
          `INSERT INTO ${table("products")} VALUES(?,?,?,?,?)`,
          ...row,
        );
    }
  }
  async tables(connection) {
    if (connection.kind === "managed") return ["profiles", "products", "notes"];
    const { rows } = await this.pool(connection).query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
    );
    return rows
      .map((r) => r.table_name)
      .filter((t) => /^[a-z_][a-z0-9_]{0,62}$/i.test(t));
  }
  async columns(connection, table) {
    identifier(table);
    if (!(await this.tables(connection)).includes(table))
      throw failure(400, "Table is not available in this connection.");
    if (connection.kind === "managed")
      return this.store.all(
        "SELECT column_name AS name,data_type AS type,is_nullable='YES' AS nullable FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position",
        this.store.schema,
        `m_${connection.app_id}_${table}`,
      );
    const { rows } = await this.pool(connection).query(
      "SELECT column_name AS name,data_type AS type,is_nullable='YES' AS nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [table],
    );
    return rows;
  }
  async validateResource(connection, resource, action = false) {
    const columns = (await this.columns(connection, resource.table)).map(
      (c) => c.name,
    );
    const required = [
      ...(action
        ? Object.values(resource.fields).map((f) => f.column)
        : [...resource.select, resource.orderBy, "id"]),
      ...(resource.scope === "user" || action ? [resource.ownerColumn] : []),
      ...resource.filters.map((f) => f.column),
    ];
    if (required.some((c) => !columns.includes(c)))
      throw failure(
        400,
        `Unknown column in ${resource.table}. Recheck its selected fields and filters.`,
      );
    if (
      action &&
      Object.values(resource.fields).some(
        (f) => f.column === resource.ownerColumn || f.column === "id",
      )
    )
      throw failure(400, "Ownership and record IDs cannot be editable fields.");
    if (
      action &&
      new Set(Object.values(resource.fields).map((f) => f.column)).size !==
        Object.keys(resource.fields).length
    )
      throw failure(400, "Write fields must target distinct columns.");
  }
  async execute(connection, sql, values = []) {
    if (connection.kind === "managed")
      return await this.store.all(sql, ...values);
    return (await this.pool(connection).query(sql, values)).rows;
  }
  build(connection, resource, context, action = false) {
    const values = [];
    const param = (v) => {
      values.push(v);
      return `$${values.length}`;
    };
    const where = [];
    if (resource.scope === "user" || action) {
      if (!context.user) throw failure(401, "Sign in to access this resource.");
      where.push(
        `${identifier(resource.ownerColumn)}=${param(context.user.id)}`,
      );
    }
    for (const filter of resource.filters) {
      let value = filter.value;
      if (value && typeof value === "object") {
        if (value.from === "auth") {
          if (!context.user || !["id", "email", "name"].includes(value.key))
            throw failure(401, "A verified user is required.");
          value = context.user[value.key];
        } else
          value = (value.from === "query" ? context.query : context.body)?.[
            value.key
          ];
      }
      if (value === undefined || value === "") {
        if (filter.optional) continue;
        throw failure(400, `Missing value for ${filter.column}.`);
      }
      const col = identifier(filter.column);
      if (value === null) {
        if (!["eq", "ne"].includes(filter.op))
          throw failure(400, "Null supports only equality filters.");
        where.push(`${col} IS ${filter.op === "ne" ? "NOT " : ""}NULL`);
        continue;
      }
      if (filter.op === "in") {
        const items = Array.isArray(value) ? value : String(value).split(",");
        if (
          !items.length ||
          items.length > 100 ||
          items.some((v) => v !== null && typeof v === "object")
        )
          throw failure(400, "Invalid list filter.");
        where.push(`${col} IN (${items.map(param).join(",")})`);
      } else if (filter.op === "contains") {
        if (typeof value !== "string")
          throw failure(400, "Search must be text.");
        where.push(
          `LOWER(CAST(${col} AS TEXT)) LIKE LOWER(${param(`%${value.replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_")}%`)}) ESCAPE '!'`,
        );
      } else {
        if (typeof value === "object")
          throw failure(400, "Filter must be a scalar.");
        where.push(
          `${col}${{ eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[filter.op]}${param(value)}`,
        );
      }
    }
    return {
      values,
      param,
      where: where.length ? ` WHERE ${where.join(" AND ")}` : "",
      table:
        connection.kind === "managed"
          ? this.managedName(connection, resource.table)
          : `public.${identifier(resource.table)}`,
    };
  }
  cursor(context, offset) {
    const payload = Buffer.from(JSON.stringify({ context, offset })).toString(
      "base64url",
    );
    return `${payload}.${createHmac("sha256", this.vault.key).update(payload).digest("base64url")}`;
  }
  readCursor(cursor, context) {
    if (!cursor) return 0;
    if (typeof cursor !== "string" || cursor.length > 2000)
      throw failure(400, "Invalid pagination cursor.");
    const [payload, signature] = cursor.split(".");
    if (
      !signature ||
      !equal(
        signature,
        createHmac("sha256", this.vault.key)
          .update(payload)
          .digest("base64url"),
      )
    )
      throw failure(400, "Invalid pagination cursor.");
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url"));
    } catch {
      throw failure(400, "Invalid pagination cursor.");
    }
    if (
      decoded.context !== context ||
      !Number.isSafeInteger(decoded.offset) ||
      decoded.offset < 0 ||
      decoded.offset > 1000000
    )
      throw failure(400, "Cursor does not belong to this query.");
    return decoded.offset;
  }
  async read(connection, resource, context, cursor) {
    await this.validateResource(connection, resource);
    const { id: resourceId, ...identity } = resource;
    const fingerprint = hash(
      JSON.stringify([
        connection.app_id,
        context.version,
        context.screenId,
        identity,
        context.user?.id,
        Object.entries(context.query || {})
          .filter(([k]) => k !== "cursor")
          .sort(),
      ]),
    );
    const offset = this.readCursor(cursor, fingerprint);
    const q = this.build(connection, resource, context);
    const limit = resource.single ? 1 : resource.limit;
    const selected = resource.select.map(identifier).join(",");
    const order = ` ORDER BY ${identifier(resource.orderBy)} ${resource.direction === "desc" ? "DESC" : "ASC"}${resource.orderBy === "id" ? "" : ', "id" ASC'}`;
    const rows = await this.execute(
      connection,
      `SELECT ${selected} FROM ${q.table}${q.where}${order} LIMIT ${q.param(limit + 1)} OFFSET ${q.param(offset)}`,
      q.values,
    );
    return {
      items: rows.slice(0, limit),
      nextCursor:
        !resource.single && rows.length > limit
          ? this.cursor(fingerprint, offset + limit)
          : null,
    };
  }
  async write(connection, resource, context) {
    await this.validateResource(connection, resource, true);
    const q = this.build(connection, resource, context, true);
    const data = {};
    for (const [name, field] of Object.entries(
      resource.operation === "delete" ? {} : resource.fields,
    )) {
      let value = context.body[name];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        if (field.required) throw failure(400, `${name} is required.`);
        continue;
      }
      if (
        (field.type === "number" || field.type === "integer") &&
        typeof value === "string" &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
      )
        value = Number(value);
      if (field.type === "number" || field.type === "integer") {
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          (field.type === "integer" && !Number.isInteger(value))
        )
          throw failure(400, `${name} must be ${field.type}.`);
      }
      if (field.type === "boolean" && typeof value !== "boolean")
        throw failure(400, `${name} must be boolean.`);
      if (
        field.type === "string" &&
        (typeof value !== "string" || value.length > field.maxLength)
      )
        throw failure(400, `${name} is invalid or too long.`);
      data[field.column] = value;
    }
    const returned = [
      "id",
      resource.ownerColumn,
      ...Object.values(resource.fields).map((f) => f.column),
    ]
      .filter((x, i, a) => a.indexOf(x) === i)
      .map(identifier)
      .join(",");
    if (resource.operation === "insert") {
      data.id = randomUUID();
      data[resource.ownerColumn] = context.user.id;
      const values = [],
        placeholders = Object.values(data).map((v) => {
          values.push(v);
          return `$${values.length}`;
        });
      return await this.execute(
        connection,
        `INSERT INTO ${q.table} (${Object.keys(data).map(identifier).join(",")}) VALUES (${placeholders.join(",")}) RETURNING ${returned}`,
        values,
      );
    }
    if (resource.operation === "delete")
      return await this.execute(
        connection,
        `DELETE FROM ${q.table}${q.where} RETURNING "id"`,
        q.values,
      );
    if (!Object.keys(data).length)
      throw failure(400, "No editable values were supplied.");
    const set = Object.entries(data)
      .map(([k, v]) => `${identifier(k)}=${q.param(v)}`)
      .join(",");
    return await this.execute(
      connection,
      `UPDATE ${q.table} SET ${set}${q.where} RETURNING ${returned}`,
      q.values,
    );
  }
  async close() {
    await Promise.all([...this.pools.values()].map((p) => p.end()));
  }
}
