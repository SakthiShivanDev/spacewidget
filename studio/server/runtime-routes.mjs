import cors from "@fastify/cors";
import { failure, hash } from "./security.mjs";
import { expandTree, expandAction } from "./schema.mjs";
import {
  composeScreen,
  resolveScreen,
  screenParameters,
  screenQuery,
} from "../shared/screens.mjs";
import { releaseDependencies } from "./releases.mjs";
import { platformRoutes } from "./platform-routes.mjs";
import { commerceRoutes } from "./commerce.mjs";
import { pushRoutes } from "./push.mjs";
export async function registerRuntimeRoutes(
  server,
  {
    store,
    vault,
    auth,
    data,
    commerce,
    httpServices,
    oauth,
    apple,
    push,
    connectionFor,
    audit,
  },
) {
  await server.register(
    async (runtime) => {
      await runtime.register(cors, {
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["content-type", "authorization", "x-space-api-key"],
      });
      runtime.addHook("preHandler", async (request) => {
        if (request.method === "OPTIONS") return;
        const key = request.headers["x-space-api-key"];
        if (typeof key !== "string" || key.length > 200)
          throw failure(
            401,
            "A valid app API key is required.",
            "APP_KEY_INVALID",
          );
        const record = await store.one(
          "SELECT app_id FROM runtime_keys WHERE hash=? AND revoked=0",
          hash(key),
        );
        if (!record)
          throw failure(
            401,
            "App API key is invalid or revoked.",
            "APP_KEY_INVALID",
          );
        request.app = await store.one(
          "SELECT * FROM apps WHERE id=?",
          record.app_id,
        );
        request.app.runtimeDependencies = await releaseDependencies(
          store,
          vault,
          request.app,
        );
      });
      async function published(request) {
        const app = request.app;
        const release = await store.one(
          "SELECT * FROM releases WHERE app_id=? AND version=?",
          app.id,
          app.published || 0,
        );
        if (!release)
          throw failure(
            404,
            "Publish this app in Studio before requesting screens.",
          );
        return { doc: JSON.parse(release.document), version: release.version };
      }
      async function render(request, screenId) {
        const { doc, version } = await published(request),
          screen = resolveScreen(doc, screenId || doc.initialScreen);
        if (!screen) throw failure(404, "Screen not found.");
        const user = await auth.current(
          request.app,
          request.headers.authorization,
        );
        if (!screen.public && !user)
          throw failure(401, "Sign in to view this screen.");
        let parameters;
        try {
          parameters = screenParameters(
            screen,
            screenQuery(
              doc,
              screenId || doc.initialScreen,
              screen,
              request.query,
              { user },
            ),
          );
        } catch (error) {
          throw failure(400, error.message);
        }
        const state = {
            ...screen.state,
            params: parameters,
            ...(screen.loader && doc.features?.includes("commerce")
              ? await commerce.screen(
                  screen.loader,
                  request.app,
                  user,
                  parameters,
                )
              : {}),
          },
          memo = new Map();
        for (const query of screen.queries) {
          const { id: queryId, ...identity } = query;
          const fingerprint = JSON.stringify(identity);
          let result = memo.get(fingerprint);
          if (!result) {
            result = await data.read(
              await connectionFor(request.app, query.connectionId),
              query,
              { user, query: parameters, version, screenId: screen.id },
            );
            memo.set(fingerprint, result);
          }
          state[queryId] = query.single
            ? result.items[0] || null
            : result.items;
          if (!query.single) state[`${queryId}Page`] = result;
        }
        state.capabilities = {
          appleOAuth: !!(
            apple.options.clientId &&
            apple.options.teamId &&
            apple.options.keyId &&
            apple.options.privateKey &&
            apple.options.callbackUrl &&
            apple.options.returnUrls?.length
          ),
          googleOAuth: !!(
            oauth.options.clientId &&
            oauth.options.clientSecret &&
            oauth.options.callbackUrl &&
            oauth.options.returnUrls?.length
          ),
        };
        Object.assign(
          state,
          await httpServices.screen(request.app, user, screen, parameters),
        );
        return {
          success: true,
          schemaVersion: 1,
          screenId: screen.id,
          version,
          app: { name: request.app.name },
          theme: doc.theme,
          darkTheme: doc.darkTheme,
          themeMode: doc.themeMode,
          state,
          onLoad: expandAction(screen.onLoad, doc),
          widgets: expandTree(composeScreen(doc, screen), doc),
        };
      }
      runtime.get("/start", async (request) => await render(request));
      runtime.get(
        "/screens/:screenId",
        async (request) => await render(request, request.params.screenId),
      );
      runtime.get("/data/:screenId/:queryId", async (request) => {
        const { doc, version } = await published(request),
          screen = doc.screens.find((s) => s.id === request.params.screenId),
          query = screen?.queries.find((q) => q.id === request.params.queryId);
        if (!query) throw failure(404, "Data source not found.");
        const user = await auth.current(
          request.app,
          request.headers.authorization,
        );
        if (!screen.public && !user)
          throw failure(401, "Sign in to access this screen.");
        const result = await data.read(
          await connectionFor(request.app, query.connectionId),
          query,
          {
            user,
            query: screenParameters(screen, request.query),
            version,
            screenId: screen.id,
          },
          request.query.cursor,
        );
        return {
          success: true,
          data: query.single ? result.items[0] || {} : result,
        };
      });
      runtime.post("/actions/:actionId", async (request) => {
        const { doc } = await published(request),
          action = doc.actions.find((a) => a.id === request.params.actionId);
        if (!action) throw failure(404, "Action not found.");
        const user = await auth.current(
          request.app,
          request.headers.authorization,
        );
        if (!user) throw failure(401, "Sign in to submit this form.");
        const rows = await data.write(
          await connectionFor(request.app, action.connectionId),
          action,
          { user, query: request.query, body: request.body || {} },
        );
        if (!rows.length)
          throw failure(404, "No permitted record matched this action.");
        await audit(request.app.id, user.id, `action:${action.id}`);
        if (action.returnScreen)
          return await render(request, action.returnScreen);
        return { success: true, data: { items: rows, count: rows.length } };
      });
      platformRoutes(server, { store, vault, runtime, auth, published });
      commerceRoutes(runtime, { commerce, auth, published });
      pushRoutes(runtime, { push, auth });
      runtime.route({
        method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        url: "/http/:serviceId/:endpointId",
        handler: async (request) => ({
          success: true,
          data: await httpServices.call(
            request.app,
            await auth.current(request.app, request.headers.authorization),
            request.params.serviceId,
            request.params.endpointId,
            request.query,
            request.body || {},
            request.method,
          ),
        }),
      });
      runtime.post(
        "/auth/oauth/google/start",
        { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
        async (request) => ({
          success: true,
          data: await oauth.start(request.app, request.body || {}),
        }),
      );
      runtime.post(
        "/auth/oauth/google/exchange",
        { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
        async (request) => ({
          success: true,
          data: await oauth.exchange(request.app, request.body || {}),
        }),
      );
      for (const [operation, handler] of [
        ["start", "start"],
        ["exchange", "exchange"],
      ])
        runtime.post(
          `/auth/oauth/apple/${operation}`,
          { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
          async (request) => ({
            success: true,
            data: await apple[handler](request.app, request.body || {}),
          }),
        );
      const authLimit = {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      };
      runtime.post("/auth/register", authLimit, async (request) => ({
        success: true,
        data: await auth.register(request.app, request.body || {}),
      }));
      runtime.post("/auth/login", authLimit, async (request) => ({
        success: true,
        data: await auth.login(request.app, request.body || {}),
      }));
      runtime.post("/auth/refresh", authLimit, async (request) => ({
        success: true,
        data: await auth.refresh(request.app, request.body?.refreshToken),
      }));
      runtime.get("/auth/me", async (request) => {
        const user = await auth.current(
          request.app,
          request.headers.authorization,
        );
        if (!user) throw failure(401, "Sign in.");
        return { success: true, data: { user } };
      });
      runtime.post("/auth/logout", async (request) => {
        let user = null;
        try {
          user = await auth.current(request.app, request.headers.authorization);
        } catch {}
        if (user?.sessionId)
          await push.revokeSession(request.app, user.sessionId);
        if (typeof request.body?.refreshToken === "string") {
          const session = await store.one(
            "SELECT id FROM runtime_sessions WHERE app_id=? AND refresh=?",
            request.app.id,
            hash(request.body.refreshToken),
          );
          if (session) await push.revokeSession(request.app, session.id);
        }
        await auth.logout(request.app, request.body || {}, user);
        return { success: true };
      });
      runtime.post("/auth/password/request", authLimit, async (request) => {
        await auth.challenge(request.app, request.body || {}, "reset");
        return {
          success: true,
          message: "If this account exists, a code has been sent.",
        };
      });
      runtime.post("/auth/password/reset", authLimit, async (request) => ({
        success: true,
        data: await auth.verifyCode(request.app, request.body || {}, "reset"),
      }));
      runtime.post("/auth/otp/request", authLimit, async (request) => {
        const user = await auth.current(
          request.app,
          request.headers.authorization,
        );
        if (!user) throw failure(401, "Sign in to verify your email.");
        await auth.challenge(request.app, request.body || {}, "verify", user);
        return { success: true };
      });
      runtime.post("/auth/otp/verify", authLimit, async (request) => ({
        success: true,
        data: await auth.verifyCode(request.app, request.body || {}, "verify"),
      }));
    },
    { prefix: "/runtime" },
  );
}
