import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer } from "../server/app.mjs";
import { createCommerceTemplate } from "../server/commerce-template.mjs";
import { parseDefinition, expandTree } from "../server/schema.mjs";
import { id, hash, token } from "../server/security.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
const server = await createServer({
  demoPayments: process.env.SPACE_DEMO_PAYMENTS === "true",
});
try {
  const marker = resolve(
      process.env.STUDIO_DATA_DIR || "data",
      "commerce-demo.json",
    ),
    store = server.store;
  if (existsSync(marker)) {
    const previous = JSON.parse(readFileSync(marker));
    if (await store.one("SELECT id FROM apps WHERE id=?", previous.appId)) {
      console.log(
        `Commerce demo already exists: ${previous.appId}. Existing data and drafts were preserved.`,
      );
      process.exitCode = 0;
    } else
      throw new Error(
        "The saved demo app is missing. Move commerce-demo.json aside to create a new demo.",
      );
  } else {
    const args = process.argv.slice(2),
      address = args.includes("--owner-email")
        ? args[args.indexOf("--owner-email") + 1]
        : null;
    const owners = address
      ? await store.all("SELECT id,email FROM admins WHERE email=?", address)
      : await store.all("SELECT id,email FROM admins");
    if (owners.length !== 1)
      throw new Error(
        "Choose an existing Studio owner using --owner-email. No passwords are changed.",
      );
    const owner = owners[0],
      appId = id(),
      connectionId = id(),
      key = token("sw_pk_"),
      keyId = id(),
      created = new Date().toISOString();
    const doc = parseDefinition(createCommerceTemplate());
    for (const screen of doc.screens) expandTree(screen.tree, doc);
    const document = JSON.stringify(doc),
      connection = {
        id: connectionId,
        app_id: appId,
        name: "Account database",
        kind: "managed",
        config: server.dataService.vault.seal({}),
      };
    await store.transaction(async () => {
      await store.run(
        "INSERT INTO apps VALUES(?,?,?,?,1,1,?)",
        appId,
        owner.id,
        "Everyday Commerce",
        document,
        created,
      );
      await store.run(
        "INSERT INTO connections VALUES(?,?,?,?,?)",
        connectionId,
        appId,
        connection.name,
        connection.kind,
        connection.config,
      );
      await server.dataService.initializeManaged(connection);
      await server.commerce.seed(appId);
      await store.run(
        "INSERT INTO releases VALUES(?,?,?,?,?,?)",
        id(),
        appId,
        1,
        document,
        hash(document),
        created,
      );
      await store.run(
        "INSERT INTO runtime_keys VALUES(?,?,?,?,?,0,?)",
        keyId,
        appId,
        "Local commerce demo",
        hash(key),
        `${key.slice(0, 12)}…${key.slice(-4)}`,
        created,
      );
      await store.run(
        "INSERT INTO audit VALUES(?,?,?,?,?)",
        id(),
        appId,
        owner.id,
        "commerce.demo.created",
        created,
      );
    });
    mkdirSync(dirname(marker), { recursive: true, mode: 0o700 });
    writeFileSync(
      marker,
      JSON.stringify(
        {
          appId,
          apiKey: key,
          baseUrl: process.env.STUDIO_ORIGIN || "http://localhost:4100",
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      `Created Everyday Commerce (${appId}), ${doc.screens.length} screens, ${doc.components.length} components, published local version 1. Existing apps are unchanged.`,
    );
    console.log(
      "For local test checkout set SPACE_DEMO_PAYMENTS=true. Build with npm run demo:build. Provider secrets stay on the server.",
    );
  }
} finally {
  await server.close();
}
