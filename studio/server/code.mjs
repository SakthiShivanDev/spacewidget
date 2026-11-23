import { Worker } from "node:worker_threads";
import { failure } from "./security.mjs";
const identifier = (value) => {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(value || ""))
    throw failure(400, "Use a lowercase code ID.");
  return value;
};
let activeWorkers = 0;
export async function runJavaScript(source, input, validateOnly = false) {
  if (
    typeof source !== "string" ||
    source.length > 50000 ||
    JSON.stringify(input).length > 128 * 1024
  )
    throw failure(400, "Code or input exceeds its size limit.");
  if (activeWorkers >= 4)
    throw failure(429, "Backend code is busy. Try again shortly.");
  activeWorkers++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./code-worker.mjs", import.meta.url), {
        workerData: { source, input, validateOnly },
        env: {},
        resourceLimits: {
          maxOldGenerationSizeMb: 48,
          maxYoungGenerationSizeMb: 8,
          stackSizeMb: 2,
        },
      });
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker
          .terminate()
          .catch(() => {})
          .finally(() => {
            error ? reject(failure(400, error)) : resolve(value);
          });
      };
      const timer = setTimeout(
        () => finish("Handler exceeded the execution deadline."),
        2500,
      );
      worker.on("message", (result) => finish(result.error, result.value));
      worker.on("error", () => finish("Handler worker failed."));
      worker.on("exit", () => {
        if (!done) finish("Handler stopped without a result.");
      });
    });
  } finally {
    activeWorkers--;
  }
}
export class CodeService {
  constructor(store) {
    this.store = store;
  }
  async list(app) {
    return this.store.all(
      "SELECT * FROM code_modules WHERE app_id=? ORDER BY id",
      app.id,
    );
  }
  async save(app, id, body) {
    identifier(id);
    if (
      !["dart", "javascript"].includes(body.kind) ||
      typeof body.source !== "string" ||
      body.source.length > 50000
    )
      throw failure(
        400,
        "Choose Dart or JavaScript and enter up to 50 KB of source.",
      );
    return this.store.transaction(async () => {
      const old = await this.store.one(
        "SELECT * FROM code_modules WHERE app_id=? AND id=?",
        app.id,
        id,
      );
      if (old && old.revision !== body.revision)
        throw failure(409, "Code changed. Reload before saving.");
      if (old && old.kind !== body.kind)
        throw failure(400, "Create a new code ID to change the language.");
      await this.store.run(
        "INSERT INTO code_modules(app_id,id,kind,source,revision) VALUES(?,?,?,?,1) ON CONFLICT(app_id,id) DO UPDATE SET source=excluded.source,revision=code_modules.revision+1",
        app.id,
        id,
        body.kind,
        body.source,
      );
      return this.list(app);
    });
  }
  async publish(app, id, body) {
    const row = await this.store.one(
      "SELECT * FROM code_modules WHERE app_id=? AND id=?",
      app.id,
      identifier(id),
    );
    if (!row || row.kind !== "javascript")
      throw failure(
        400,
        "Only backend JavaScript can be enabled on the server. Export Dart into your Flutter host.",
      );
    if (row.revision !== body.revision)
      throw failure(409, "Code changed. Reload before enabling.");
    await runJavaScript(row.source, {}, true);
    const changed = await this.store.run(
      "UPDATE code_modules SET published_source=source,published_revision=revision WHERE app_id=? AND id=? AND revision=?",
      app.id,
      id,
      row.revision,
    );
    if (!changed.changes)
      throw failure(409, "Code changed. Reload before enabling.");
    return this.list(app);
  }
  async execute(app, user, id, input) {
    if (!user) throw failure(401, "Sign in to run this backend function.");
    const row = app.runtimeDependencies
      ? { published_source: app.runtimeDependencies.functions[identifier(id)] }
      : await this.store.one(
          "SELECT published_source FROM code_modules WHERE app_id=? AND id=? AND kind='javascript'",
          app.id,
          identifier(id),
        );
    if (!row?.published_source)
      throw failure(404, "Enabled backend function not found.");
    return runJavaScript(row.published_source, {
      input,
      user: { id: user.id, email: user.email, name: user.name },
      app: { id: app.id },
    });
  }
}
