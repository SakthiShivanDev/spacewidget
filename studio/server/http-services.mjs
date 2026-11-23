import { z } from "zod";
import { failure } from "./security.mjs";
const slug = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const configSchema = z
  .object({
    baseUrl: z.string().url(),
    headers: z
      .record(z.string().regex(/^[a-zA-Z0-9-]{1,80}$/), z.string().max(4096))
      .default({}),
    endpoints: z
      .array(
        z
          .object({
            id: slug,
            path: z.string().min(1).max(1000),
            method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
            public: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
export class HttpServices {
  constructor(store, vault, options = {}) {
    Object.assign(this, { store, vault, options });
    this.fetch = options.fetch || fetch;
  }
  validate(value) {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success)
      throw failure(
        400,
        "Use an absolute API base URL and named endpoint paths/methods.",
      );
    const config = parsed.data,
      base = new URL(config.baseUrl);
    const local =
      !this.options.production &&
      this.options.allowLocalhost &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (
      (!local && base.protocol !== "https:") ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !this.options.hosts?.includes(base.hostname)
    )
      throw failure(
        400,
        "Use an HTTPS origin approved in STUDIO_HTTP_HOSTS. Local HTTP additionally requires STUDIO_HTTP_ALLOW_LOCALHOST=true outside production.",
      );
    if (
      new Set(config.endpoints.map((e) => e.id)).size !==
      config.endpoints.length
    )
      throw failure(400, "API endpoint IDs must be unique.");
    for (const endpoint of config.endpoints) {
      const url = new URL(endpoint.path, base);
      if (
        url.origin !== base.origin ||
        !endpoint.path.startsWith("/") ||
        endpoint.path.startsWith("//") ||
        url.hash ||
        url.username ||
        url.password
      )
        throw failure(
          400,
          "Endpoint paths must stay on the configured API origin.",
        );
      if (endpoint.public && endpoint.method !== "GET")
        throw failure(
          400,
          "Public API endpoints must be read-only GET requests.",
        );
    }
    if (
      Object.keys(config.headers).some((k) =>
        [
          "host",
          "content-length",
          "connection",
          "cookie",
          "x-space-user-id",
          "x-space-app-id",
        ].includes(k.toLowerCase()),
      )
    )
      throw failure(400, "Reserved HTTP header.");
    return config;
  }
  async save(app, id, value) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(id))
      throw failure(
        400,
        "Choose a service ID using letters, numbers and hyphens.",
      );
    const previous = await this.store.one(
      "SELECT config FROM http_services WHERE app_id=? AND id=?",
      app.id,
      id,
    );
    const config = this.validate({
      ...value,
      headers:
        value.headers ??
        (previous ? this.vault.open(previous.config).headers : {}),
    });
    await this.store.run(
      "INSERT INTO http_services VALUES(?,?,?) ON CONFLICT(app_id,id) DO UPDATE SET config=excluded.config",
      app.id,
      id,
      this.vault.seal(config),
    );
    return await this.list(app);
  }
  async list(app) {
    return (
      await this.store.all(
        "SELECT id,config FROM http_services WHERE app_id=? ORDER BY id",
        app.id,
      )
    ).map((r) => {
      const c = this.vault.open(r.config);
      return {
        id: r.id,
        baseUrl: c.baseUrl,
        headerNames: Object.keys(c.headers),
        endpoints: c.endpoints,
      };
    });
  }
  async get(app, serviceId, endpointId) {
    if (app.runtimeDependencies) {
      const pinned = app.runtimeDependencies.httpServices[serviceId];
      if (!pinned)
        throw failure(404, "Publish the app to use this API connection.");
      let config = this.validate(pinned);
      // Rotate credentials without changing the published origin or endpoint.
      const live = await this.store.one(
        "SELECT config FROM http_services WHERE app_id=? AND id=?",
        app.id,
        serviceId,
      );
      const current = live ? this.vault.open(live.config) : null;
      if (current?.baseUrl === config.baseUrl)
        config = { ...config, headers: current.headers };
      const endpoint = config.endpoints.find((e) => e.id === endpointId);
      if (!endpoint)
        throw failure(404, "Publish the app to use this API endpoint.");
      return { config, endpoint };
    }
    const row = await this.store.one(
      "SELECT config FROM http_services WHERE app_id=? AND id=?",
      app.id,
      serviceId,
    );
    if (!row) throw failure(404, "HTTP service not found in this app.");
    const config = this.validate(this.vault.open(row.config)),
      endpoint = config.endpoints.find((e) => e.id === endpointId);
    if (!endpoint) throw failure(404, "HTTP endpoint not found.");
    return { config, endpoint };
  }
  async call(app, user, serviceId, endpointId, query = {}, body = {}, method) {
    const { config, endpoint } = await this.get(app, serviceId, endpointId);
    if (method && method !== endpoint.method)
      throw failure(405, "Method does not match this saved endpoint.");
    if (!endpoint.public && !user)
      throw failure(401, "Sign in to call this API.");
    const url = new URL(endpoint.path, config.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value != null)
        url.searchParams.set(key, String(value).slice(0, 2000));
    }
    const response = await this.fetch(url, {
      method: endpoint.method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        ...config.headers,
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Space-App-ID": app.id,
        ...(user ? { "X-Space-User-ID": user.id } : {}),
      },
      ...(endpoint.method === "GET" ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw failure(502, `The connected API returned HTTP ${response.status}.`);
    const reader = response.body?.getReader();
    if (!reader)
      throw failure(502, "The connected API returned an empty response.");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 1024 * 1024)
          throw failure(502, "The connected API response exceeds 1 MB.");
        chunks.push(Buffer.from(part.value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      throw failure(502, "The connected API must return JSON.");
    }
  }
  async screen(app, user, screen, requestQuery) {
    const state = {};
    for (const source of screen.httpQueries || []) {
      const { endpoint } = await this.get(
        app,
        source.serviceId,
        source.endpointId,
      );
      if (endpoint.method !== "GET" || (screen.public && !endpoint.public))
        throw failure(
          400,
          "Screen API sources must use GET and public screens need public endpoints.",
        );
      const query = Object.fromEntries(
        Object.entries(source.query).map(([key, value]) => [
          key,
          value && typeof value === "object"
            ? value.from === "auth"
              ? user?.[value.key]
              : requestQuery?.[value.key]
            : value,
        ]),
      );
      state[source.id] = await this.call(
        app,
        user,
        source.serviceId,
        source.endpointId,
        query,
      );
    }
    return state;
  }
}
