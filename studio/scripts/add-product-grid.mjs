import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { openStore } from "../server/store.mjs";
import { id } from "../server/security.mjs";
import { addProductGrid } from "../components/product-grid.mjs";

if (existsSync(".env")) process.loadEnvFile(".env");
const args = process.argv.slice(2);
const appId = args[args.indexOf("--app-id") + 1];
if (!args.includes("--app-id") || !appId)
  throw new Error("Use --app-id <app ID> [--screen main].");
const screenId = args.includes("--screen")
  ? args[args.indexOf("--screen") + 1]
  : "main";
const database = process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL;
const store = await openStore(database);
try {
  const app = await store.one("SELECT * FROM apps WHERE id=?", appId);
  if (!app) throw new Error("App not found.");
  const doc = addProductGrid(JSON.parse(app.draft), screenId);
  const backups = join(process.env.STUDIO_DATA_DIR || "data", "backups");
  await mkdir(backups, { recursive: true, mode: 0o700 });
  await writeFile(
    join(backups, `${app.id}-revision-${app.revision}.json`),
    app.draft,
    { mode: 0o600, flag: "wx" },
  );
  await store.transaction(async () => {
    const changed = await store.run(
      "UPDATE apps SET draft=?,revision=revision+1 WHERE id=? AND revision=?",
      JSON.stringify(doc),
      app.id,
      app.revision,
    );
    if (!changed.changes)
      throw new Error(
        "The draft changed while preparing this component. Reload and retry.",
      );
    await store.run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      id(),
      app.id,
      app.owner,
      "component.created:product-grid",
      new Date().toISOString(),
    );
  });
  console.log(
    `Created Product grid on ${app.name}/${screenId}. Saved draft revision ${app.revision + 1}; publish from Studio when ready.`,
  );
} finally {
  await store.close();
}
