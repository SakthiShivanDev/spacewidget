import { createServer } from "../server/app.mjs";
import { testStoreOptions, dropTestStore } from "./database.mjs";
const options = await testStoreOptions();
const server = await createServer({
  ...options,
  setupToken: process.env.STUDIO_SETUP_TOKEN,
  masterKey: process.env.STUDIO_MASTER_KEY,
  origin: process.env.STUDIO_ORIGIN,
  rateLimit: false,
  httpHosts: ["catalog.example.test"],
  httpFetch: async (url, options) => {
    const uri = new URL(url);
    if (uri.hostname !== "catalog.example.test")
      throw new Error("Unknown browser fixture host");
    return Response.json(
      options.method === "GET"
        ? {
            items: [
              {
                id: "fixture-product",
                name: `Result ${uri.searchParams.get("category") || "all"}`,
                price: 42,
              },
            ],
            total: 1,
          }
        : { saved: JSON.parse(options.body || "{}") },
    );
  },
});
await server.listen({
  host: "127.0.0.1",
  port: Number(process.env.PORT || 4176),
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    await dropTestStore(options);
    process.exit(0);
  });
