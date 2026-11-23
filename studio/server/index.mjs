import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const { createServer } = await import("./app.mjs");
const trustedProxies = String(process.env.STUDIO_TRUSTED_PROXIES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const server = await createServer({
  trustProxy: trustedProxies.length ? trustedProxies : false,
  logger: {
    level: "info",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-space-api-key",
      "req.headers.x-setup-token",
    ],
  },
});
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4100);
await server.listen({ host, port });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
