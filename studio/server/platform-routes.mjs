import { failure, id } from "./security.mjs";
import { DesignAI } from "./ai.mjs";
import { CodeService, runJavaScript } from "./code.mjs";
import {
  resolveScreen,
  screenParameters,
  screenQuery,
} from "../shared/screens.mjs";
export function platformRoutes(
  server,
  { store, vault, admin, appFor, auth, published, runtime, aiFetch },
) {
  if (runtime) {
    runtime.post(
      "/functions/:functionId",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (request) => {
        const user = await auth.current(
          request.app,
          request.headers.authorization,
        );
        return {
          success: true,
          data: await new CodeService(store).execute(
            request.app,
            user,
            request.params.functionId,
            request.body || {},
          ),
        };
      },
    );
    runtime.get("/integrations/app-links", async (request) => {
      const row = await store.one(
        "SELECT config FROM app_links WHERE app_id=?",
        request.app.id,
      );
      return {
        success: true,
        data: row ? JSON.parse(row.config) : { links: [] },
      };
    });
    return;
  }
  const ai = new DesignAI(store, vault, { fetch: aiFetch }),
    code = new CodeService(store);
  server.get("/api/ai/settings", { preHandler: admin }, (request) =>
    ai.settings(request.admin.admin_id),
  );
  server.put("/api/ai/settings/:provider", { preHandler: admin }, (request) =>
    ai.save(
      request.admin.admin_id,
      request.params.provider,
      request.body || {},
    ),
  );
  server.post(
    "/api/apps/:appId/ai/design",
    {
      preHandler: admin,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request) =>
      ai.generate(
        request.admin.admin_id,
        await appFor(request),
        request.body || {},
      ),
  );
  server.get("/api/apps/:appId/code", { preHandler: admin }, async (request) =>
    code.list(await appFor(request)),
  );
  server.put(
    "/api/apps/:appId/code/:codeId",
    { preHandler: admin },
    async (request) =>
      code.save(
        await appFor(request),
        request.params.codeId,
        request.body || {},
      ),
  );
  server.post(
    "/api/apps/:appId/code/:codeId/test",
    {
      preHandler: admin,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (request) => {
      const app = await appFor(request);
      return {
        data: await runJavaScript(request.body?.source, {
          input: request.body?.input || {},
          user: { id: "preview-user" },
          app: { id: app.id },
        }),
      };
    },
  );
  server.post(
    "/api/apps/:appId/code/:codeId/publish",
    { preHandler: admin },
    async (request) =>
      code.publish(
        await appFor(request),
        request.params.codeId,
        request.body || {},
      ),
  );
  server.get(
    "/api/apps/:appId/code/:codeId/export",
    { preHandler: admin },
    async (request, reply) => {
      const app = await appFor(request),
        row = (await code.list(app)).find(
          (c) => c.id === request.params.codeId && c.kind === "dart",
        );
      if (!row) throw failure(404, "Dart module not found.");
      return reply
        .type("text/plain; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="${row.id}.dart"`)
        .send(row.source);
    },
  );
  server.get(
    "/api/apps/:appId/app-links",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        row = await store.one(
          "SELECT config FROM app_links WHERE app_id=?",
          app.id,
        );
      return row ? JSON.parse(row.config) : { links: [] };
    },
  );
  server.put(
    "/api/apps/:appId/app-links",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        links = request.body?.links;
      if (!Array.isArray(links) || links.length > 30)
        throw failure(400, "Use up to 30 approved external app links.");
      const clean = links.map((link) => {
        const name = String(link.name || "").trim();
        let url;
        try {
          url = new URL(link.url);
        } catch {
          throw failure(400, "Enter a valid external app URL.");
        }
        if (
          !name ||
          name.length > 80 ||
          link.url.length > 2000 ||
          !/^(https:|mailto:|tel:|[a-z][a-z0-9+.-]*:)$/i.test(url.protocol) ||
          [
            "javascript:",
            "data:",
            "file:",
            "http:",
            "intent:",
            "vbscript:",
            "blob:",
          ].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw failure(
            400,
            "Use HTTPS or an approved app scheme, without credentials.",
          );
        return { name, url: url.toString() };
      });
      if (new Set(clean.map((link) => link.name)).size !== clean.length)
        throw failure(400, "App link names must be unique.");
      await store.run(
        "INSERT INTO app_links VALUES(?,?) ON CONFLICT(app_id) DO UPDATE SET config=excluded.config",
        app.id,
        JSON.stringify({ links: clean }),
      );
      return { links: clean };
    },
  );
  server.get(
    "/api/apps/:appId/push/destinations",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      const release = await store.one(
        "SELECT document FROM releases WHERE app_id=? AND version=?",
        app.id,
        app.published || 0,
      );
      if (!release) return [];
      const doc = JSON.parse(release.document);
      return doc.screens
        .filter((s) => resolveScreen(doc, s.id)?.id === s.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          parameters: s.parameters || {},
        }));
    },
  );
  server.post(
    "/api/apps/:appId/push/send",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        body = request.body || {};
      const user = await store.one(
        "SELECT id,name,email FROM runtime_users WHERE app_id=? AND id=?",
        app.id,
        body.userId || "",
      );
      const release = await store.one(
        "SELECT document FROM releases WHERE app_id=? AND version=?",
        app.id,
        app.published || 0,
      );
      const doc = release && JSON.parse(release.document);
      const screen = doc && resolveScreen(doc, body.screenId);
      const title = String(body.title || "").trim(),
        message = String(body.body || "").trim(),
        input = body.query || {};
      if (
        !user ||
        !screen ||
        !title ||
        title.length > 100 ||
        !message ||
        message.length > 1000 ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).length > 10 ||
        Object.values(input).some(
          (v) =>
            !["string", "number", "boolean"].includes(typeof v) ||
            String(v).length > 200,
        )
      )
        throw failure(
          400,
          "Choose an app user, a published screen and a short notification. Destination parameters must be text, numbers or true / false values.",
        );
      const query = screenParameters(
        screen,
        screenQuery(doc, body.screenId, screen, input, { user }),
      );
      if (body.confirm !== true)
        return {
          preview: {
            userId: user.id,
            title,
            body: message,
            screenId: screen.id,
            query,
          },
          confirmRequired: true,
        };
      const notificationId = id();
      await store.transaction(async () => {
        await store.run(
          "INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?,0)",
          notificationId,
          app.id,
          user.id,
          title,
          message,
          screen.id,
          null,
          new Date().toISOString(),
        );
        await store.run(
          "INSERT INTO notification_destinations VALUES(?,?)",
          notificationId,
          JSON.stringify(query),
        );
      });
      return { queued: true, notificationId };
    },
  );
}
