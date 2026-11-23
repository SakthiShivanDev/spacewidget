import { testStoreOptions, dropTestStore } from "./database.mjs";
import { createServer } from "../server/app.mjs";
const database = await testStoreOptions();
const server = await createServer({
  ...database,
  masterKey: "6".repeat(64),
  setupToken: "live-sdk-test-setup-token-only",
  rateLimit: false,
  demoPayments: process.env.SPACE_TEST_TEMPLATE === "commerce",
});
await server.inject({
  method: "POST",
  url: "/api/setup",
  headers: { "x-setup-token": "live-sdk-test-setup-token-only" },
  payload: { email: "owner@example.com", password: "live-fixture-password" },
});
const login = await server.inject({
  method: "POST",
  url: "/api/login",
  payload: { email: "owner@example.com", password: "live-fixture-password" },
});
const headers = {
  cookie: `sw_studio=${login.cookies[0].value}`,
  "x-csrf-token": login.json().csrf,
};
const app = (
  await server.inject({
    method: "POST",
    url: "/api/apps",
    headers,
    payload: {
      name: "SDK integration",
      ...(process.env.SPACE_TEST_TEMPLATE
        ? { template: process.env.SPACE_TEST_TEMPLATE }
        : {}),
    },
  })
).json();
await server.inject({
  method: "POST",
  url: `/api/apps/${app.id}/releases`,
  headers,
  payload: { revision: app.revision },
});
const key = (
  await server.inject({
    method: "POST",
    url: `/api/apps/${app.id}/keys`,
    headers,
    payload: {},
  })
).json().key;
await server.listen({ host: "127.0.0.1", port: 0 });
process.stdout.write(
  JSON.stringify({
    baseUrl: `http://127.0.0.1:${server.server.address().port}`,
    apiKey: key,
  }) + "\n",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    await dropTestStore(database);
    process.exit(0);
  });
