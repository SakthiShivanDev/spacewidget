import { registerRuntimeRoutes } from "./runtime-routes.mjs";
import { openingOverlays } from "../shared/authoring.mjs";
import { componentPreviewState } from "../shared/component-preview.mjs";
import {
  composeScreen,
  resolveScreen,
  screenParameters,
  screenQuery,
} from "../shared/screens.mjs";
import { captureDependencies, releaseDependencies } from "./releases.mjs";
import Fastify, { LogController } from "fastify";
import formbody from "@fastify/formbody";
import { platformRoutes } from "./platform-routes.mjs";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./store.mjs";
import {
  encryption,
  id,
  token,
  hash,
  equal,
  passwordHash,
  verifyPassword,
  failure,
  email,
  validEmail,
} from "./security.mjs";
import {
  parseDefinition,
  expandTree,
  expandPreviewTree,
  expandAction,
  widgetTypes,
} from "./schema.mjs";
import { DataService } from "./data.mjs";
import { RuntimeAuth } from "./auth.mjs";
import { HttpServices } from "./http-services.mjs";
import { PushService } from "./push.mjs";
import { GoogleOAuth } from "./oauth.mjs";
import { CommerceService } from "./commerce.mjs";
import { createCommerceTemplate } from "../templates/commerce/index.mjs";
import { starter } from "../templates/basic.mjs";
import { figmaPluginArchive } from "./figma-plugin.mjs";

export async function createServer(options = {}) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origin =
    options.origin || process.env.STUDIO_ORIGIN || "http://localhost:4100";
  const setupToken = options.setupToken ?? process.env.STUDIO_SETUP_TOKEN;
  const vault = encryption(options.masterKey || process.env.STUDIO_MASTER_KEY);
  if (!setupToken || setupToken.length < 20)
    throw new Error(
      "A STUDIO_SETUP_TOKEN of at least 20 characters is required.",
    );
  const store = await openStore(
    options.databaseUrl ||
      options.database ||
      process.env.STUDIO_DATABASE_URL ||
      process.env.DATABASE_URL,
    {
      schema: options.schema,
      production,
      tls:
        options.databaseTls ??
        (process.env.STUDIO_DATABASE_TLS === "false" ? false : undefined),
      ca: process.env.STUDIO_DATABASE_CA,
    },
  );
  const data = new DataService(store, vault, {
    production,
    environmentDatabase: {
      url:
        options.appDatabaseUrl ??
        process.env.APP_DATABASE_URL ??
        process.env.DATABASE_URL,
      tls: options.appDatabaseTls ?? process.env.APP_DATABASE_TLS !== "false",
      ca: options.appDatabaseCa ?? process.env.APP_DATABASE_CA,
    },
    allowedHosts:
      options.allowedDbHosts ||
      String(process.env.STUDIO_DB_HOSTS || "")
        .split(",")
        .filter(Boolean),
  });
  const auth = new RuntimeAuth(store, vault, data, {
    production,
    smtpUrl: options.smtpUrl || process.env.SMTP_URL,
    mailFrom: process.env.MAIL_FROM || "SpaceWidget <noreply@localhost>",
  });
  const commerce = new CommerceService(store, {
    production,
    demoPayments:
      options.demoPayments ?? process.env.SPACE_DEMO_PAYMENTS === "true",
    paymentProvider: options.paymentProvider ?? process.env.PAYMENT_PROVIDER,
    currency: options.paymentCurrency ?? process.env.PAYMENT_CURRENCY,
    razorpayKeyId: options.razorpayKeyId ?? process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret:
      options.razorpayKeySecret ?? process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret:
      options.razorpayWebhookSecret ?? process.env.RAZORPAY_WEBHOOK_SECRET,
    razorpayReturnUrl:
      options.razorpayReturnUrl ?? process.env.RAZORPAY_RETURN_URL,
    stripeKey: options.stripeKey ?? process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret:
      options.stripeWebhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET,
    stripeReturnUrl: options.stripeReturnUrl ?? process.env.STRIPE_RETURN_URL,
    fetch: options.providerFetch,
  });
  const oauth = new GoogleOAuth(store, vault, auth, data, {
    clientId: options.googleClientId ?? process.env.GOOGLE_CLIENT_ID,
    clientSecret:
      options.googleClientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: options.googleCallbackUrl ?? process.env.GOOGLE_CALLBACK_URL,
    returnUrls:
      options.authReturnUrls ??
      String(process.env.SPACE_AUTH_RETURN_URLS || "")
        .split(",")
        .filter(Boolean),
    fetch: options.providerFetch,
    verifyToken: options.verifyGoogleToken,
  });
  const apple = new GoogleOAuth(store, vault, auth, data, {
    provider: "apple",
    clientId: options.appleClientId ?? process.env.APPLE_CLIENT_ID,
    teamId: options.appleTeamId ?? process.env.APPLE_TEAM_ID,
    keyId: options.appleKeyId ?? process.env.APPLE_KEY_ID,
    privateKey: options.applePrivateKey ?? process.env.APPLE_PRIVATE_KEY,
    callbackUrl: options.appleCallbackUrl ?? process.env.APPLE_CALLBACK_URL,
    returnUrls:
      options.authReturnUrls ??
      String(process.env.SPACE_AUTH_RETURN_URLS || "")
        .split(",")
        .filter(Boolean),
    fetch: options.providerFetch,
    verifyToken: options.verifyAppleToken,
  });
  const push = new PushService(store, vault, {
    resolveLegacyDestination: async (app, user, notification) => {
      const order = await store.one(
        "SELECT id FROM commerce_orders WHERE id=? AND app_id=? AND user_id=?",
        notification.order_id,
        app.id,
        user.id,
      );
      return order ? { screenId: "order", query: { orderId: order.id } } : null;
    },
    account:
      options.firebaseAccount ??
      (process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
        : null),
    fetch: options.providerFetch,
  });
  const httpServices = new HttpServices(store, vault, {
    production,
    hosts:
      options.httpHosts ??
      String(process.env.STUDIO_HTTP_HOSTS || "")
        .split(",")
        .filter(Boolean),
    allowLocalhost:
      options.httpAllowLocalhost ??
      process.env.STUDIO_HTTP_ALLOW_LOCALHOST === "true",
    fetch: options.httpFetch,
  });
  const server = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 12 * 1024 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: options.trustProxy ?? false,
  });
  server.decorate("store", store);
  server.decorate("dataService", data);
  server.decorate("commerce", commerce);
  server.decorate("pushService", push);
  let pushPending = Promise.resolve();
  const pushTimer = setInterval(async () => {
    if (!push.sending) pushPending = push.flush().catch(() => {});
  }, 30000);
  pushTimer.unref();

  await server.register(cookie);
  await server.register(formbody);
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'wasm-unsafe-eval'",
          "https://www.gstatic.com",
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/",
        ],
        workerSrc: [
          "'self'",
          "blob:",
          "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:", ...(production ? [] : ["http:"])],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        connectSrc: [
          "'self'",
          "https://www.gstatic.com",
          "https://fonts.gstatic.com",
          "https:",
          ...(production ? [] : ["http:"]),
        ],
        frameSrc: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await server.register(rateLimit, {
    global: options.rateLimit !== false,
    max: 300,
    timeWindow: "1 minute",
    keyGenerator: async (request) => {
      // Authenticated designers have separate preview and API budgets; a team
      // behind one NAT must not exhaust each other's authoring allowance.
      if (request.url.startsWith("/api/apps/") && request.cookies.sw_studio) {
        const session = await store.one(
          "SELECT admin_id FROM admin_sessions WHERE hash=? AND expires>?",
          hash(request.cookies.sw_studio),
          Date.now(),
        );
        if (session)
          return `builder:${session.admin_id}:${request.url.split("?")[0].endsWith("/preview") ? "preview" : "api"}`;
      }
      return request.ip;
    },
    // Flutter's engine, fonts and assets are public static resources. Loading
    // the canvas must not consume the authenticated editor/API request budget.
    allowList: (request) =>
      request.method === "GET" &&
      (request.url === "/" ||
        request.url === "/health" ||
        ["/assets/", "/flutter-preview/", "/commerce-demo/"].some((prefix) =>
          request.url.startsWith(prefix),
        )),
  });
  server.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api") || request.url.startsWith("/runtime"))
      reply.header("Cache-Control", "no-store");
    return payload;
  });
  server.setErrorHandler((error, request, reply) => {
    if (options.debugErrors) console.error(error.stack);
    if (typeof error.code === "string" && error.code.startsWith("22"))
      error = failure(400, "A field or filter value has an invalid format.");
    if (["23505", "23503", "23514"].includes(error.code))
      error = failure(409, "This change conflicts with a database constraint.");
    const status =
      error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;
    if (status === 500)
      server.log.error(
        { requestId: request.id, code: error.code },
        "Request failed",
      );
    reply.code(status).send({
      success: false,
      message:
        status === 500 ? "Unable to complete this request." : error.message,
      code:
        error.publicCode ||
        (status === 401
          ? "AUTH_REQUIRED"
          : status === 409
            ? "CONFLICT"
            : "REQUEST_FAILED"),
    });
  });
  async function audit(app, actor, event) {
    await store.run(
      "INSERT INTO audit VALUES(?,?,?,?,?)",
      id(),
      app,
      actor,
      event,
      new Date().toISOString(),
    );
  }
  async function admin(request) {
    const saved = request.cookies.sw_studio;
    const session =
      saved &&
      (await store.one(
        "SELECT s.*,a.email FROM admin_sessions s JOIN admins a ON a.id=s.admin_id WHERE s.hash=? AND s.expires>?",
        hash(saved),
        Date.now(),
      ));
    if (!session) throw failure(401, "Sign in to Studio.");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      !equal(request.headers["x-csrf-token"] || "", session.csrf)
    )
      throw failure(403, "Invalid request token. Reload Studio.");
    request.admin = session;
    return session;
  }
  async function appFor(request) {
    const app = await store.one(
      "SELECT * FROM apps WHERE id=? AND owner=?",
      request.params.appId,
      request.admin.admin_id,
    );
    if (!app) throw failure(404, "App not found.");
    return app;
  }
  const summary = (app) => ({
    id: app.id,
    name: app.name,
    revision: app.revision,
    published: app.published,
    created: app.created,
  });
  const connectionFor = async (app, connectionId) => {
    const c = await store.one(
      "SELECT * FROM connections WHERE id=? AND app_id=?",
      connectionId,
      app.id,
    );
    if (!c) throw failure(400, "Connection not found in this app.");
    return c;
  };
  async function validateDocument(app, doc) {
    for (const screen of doc.screens)
      for (const q of screen.queries)
        await data.validateResource(
          await connectionFor(app, q.connectionId),
          q,
        );
    for (const screen of doc.screens)
      for (const source of screen.httpQueries || []) {
        const { endpoint } = await httpServices.get(
          app,
          source.serviceId,
          source.endpointId,
        );
        if (endpoint.method !== "GET" || (screen.public && !endpoint.public))
          throw failure(
            400,
            "Screen HTTP sources require GET and public screens require public endpoints.",
          );
      }
    for (const action of doc.actions)
      await data.validateResource(
        await connectionFor(app, action.connectionId),
        action,
        true,
      );
  }
  async function keyCreate(app, label) {
    const value = token("sw_pk_"),
      keyId = id();
    await store.run(
      "INSERT INTO runtime_keys VALUES(?,?,?,?,?,0,?)",
      keyId,
      app.id,
      label,
      hash(value),
      `${value.slice(0, 12)}…${value.slice(-4)}`,
      new Date().toISOString(),
    );
    await audit(app.id, app.owner, "key.created");
    return { id: keyId, key: value, label };
  }
  server.get("/health", async () => {
    await store.one("SELECT 1 AS ready");
    return { status: "ok", schemaVersion: 1, database: "postgres" };
  });
  server.get("/api/setup", async () => ({
    required: !(await store.one("SELECT id FROM admins LIMIT 1")),
  }));
  server.post(
    "/api/setup",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (await store.one("SELECT id FROM admins LIMIT 1"))
        throw failure(409, "Studio is already configured.");
      if (!equal(request.headers["x-setup-token"] || "", setupToken))
        throw failure(403, "Invalid setup token.");
      const body = request.body || {},
        address = validEmail(email(body.email)),
        password = await passwordHash(body.password);
      // Unique first owner creation is checked again after asynchronous hashing.
      await store.transaction(async () => {
        if (await store.one("SELECT id FROM admins LIMIT 1"))
          throw failure(409, "Studio is already configured.");
        await store.run(
          "INSERT INTO admins(id,email,password) VALUES(?,?,?)",
          id(),
          address,
          password,
        );
      });
      reply.code(201);
      return { success: true };
    },
  );
  server.post(
    "/api/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body || {},
        owner = await store.one(
          "SELECT * FROM admins WHERE email=?",
          email(body.email),
        );
      if (!(await verifyPassword(body.password, owner?.password)))
        throw failure(401, "Email or password is incorrect.");
      const value = token(),
        csrf = token();
      await store.run(
        "INSERT INTO admin_sessions VALUES(?,?,?,?)",
        hash(value),
        owner.id,
        csrf,
        Date.now() + 12 * 3600000,
      );
      reply.setCookie("sw_studio", value, {
        path: "/api",
        httpOnly: true,
        sameSite: "strict",
        secure: production,
        maxAge: 12 * 3600,
      });
      return {
        success: true,
        email: owner.email,
        csrf,
        isOwner:
          (await store.one("SELECT id FROM admins ORDER BY ordinal LIMIT 1"))
            .id === owner.id,
      };
    },
  );
  server.post("/api/invites", { preHandler: admin }, async (request) => {
    if (
      (await store.one("SELECT id FROM admins ORDER BY ordinal LIMIT 1")).id !==
      request.admin.admin_id
    )
      throw failure(403, "Only the server owner can invite builders.");
    const address = validEmail(email(request.body?.email));
    if (await store.one("SELECT id FROM admins WHERE email=?", address))
      throw failure(409, "This builder already has an account.");
    const invite = token("sw_inv_");
    await store.run(
      "INSERT INTO invites VALUES(?,?,?,0,?)",
      hash(invite),
      address,
      Date.now() + 3 * 86400000,
      request.admin.admin_id,
    );
    return {
      success: true,
      email: address,
      url: `${origin}/?invite=${invite}`,
      expiresInHours: 72,
    };
  });
  server.post(
    "/api/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request) => {
      const body = request.body || {},
        address = validEmail(email(body.email));
      if (typeof body.invite !== "string" || body.invite.length > 200)
        throw failure(403, "A valid builder invitation is required.");
      const invitation = await store.one(
        "SELECT * FROM invites WHERE hash=? AND email=? AND used=0 AND expires>?",
        hash(body.invite),
        address,
        Date.now(),
      );
      if (!invitation) throw failure(403, "Invitation is invalid or expired.");
      const password = await passwordHash(body.password);
      await store.transaction(async () => {
        if (
          !(
            await store.run(
              "UPDATE invites SET used=1 WHERE hash=? AND used=0",
              invitation.hash,
            )
          ).changes
        )
          throw failure(403, "Invitation was already used.");
        await store.run(
          "INSERT INTO admins(id,email,password) VALUES(?,?,?)",
          id(),
          address,
          password,
        );
      });
      return { success: true };
    },
  );
  server.get("/api/me", { preHandler: admin }, async (request) => ({
    email: request.admin.email,
    csrf: request.admin.csrf,
    isOwner:
      (await store.one("SELECT id FROM admins ORDER BY ordinal LIMIT 1")).id ===
      request.admin.admin_id,
  }));
  server.post("/api/logout", { preHandler: admin }, async (request, reply) => {
    await store.run(
      "DELETE FROM admin_sessions WHERE hash=?",
      request.admin.hash,
    );
    reply.clearCookie("sw_studio", { path: "/api" });
    return { success: true };
  });
  platformRoutes(server, {
    store,
    vault,
    admin,
    appFor,
    aiFetch: options.aiFetch,
  });
  server.get("/api/catalog", { preHandler: admin }, async () => ({
    widgets: widgetTypes,
  }));
  server.get(
    "/api/figma-plugin",
    { preHandler: admin },
    async (_request, reply) => {
      reply
        .type("application/zip")
        .header(
          "Content-Disposition",
          'attachment; filename="spacewidget-figma-plugin.zip"',
        );
      return figmaPluginArchive();
    },
  );
  server.get("/api/apps", { preHandler: admin }, async (request) =>
    (
      await store.all(
        "SELECT * FROM apps WHERE owner=? ORDER BY created DESC",
        request.admin.admin_id,
      )
    ).map(summary),
  );
  server.get(
    "/api/apps/:appId/http-services",
    { preHandler: admin },
    async (request) => await httpServices.list(await appFor(request)),
  );
  server.put(
    "/api/apps/:appId/http-services/:serviceId",
    { preHandler: admin },
    async (request) =>
      await httpServices.save(
        await appFor(request),
        request.params.serviceId,
        request.body,
      ),
  );
  server.post(
    "/api/apps/:appId/http-services/:serviceId/:endpointId/test",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        body = request.body || {};
      const user = body.userId
        ? await store.one(
            "SELECT id,email,name,verified FROM runtime_users WHERE app_id=? AND id=?",
            app.id,
            body.userId,
          )
        : null;
      if (body.userId && !user)
        throw failure(400, "Choose a user from this app.");
      const { endpoint } = await httpServices.get(
        app,
        request.params.serviceId,
        request.params.endpointId,
      );
      if (endpoint.method !== "GET" && body.confirm !== true)
        throw failure(
          400,
          "Confirm that this test can change data at the connected API.",
        );
      return {
        data: await httpServices.call(
          app,
          user,
          request.params.serviceId,
          request.params.endpointId,
          body.query || {},
          body.body || {},
          endpoint.method,
        ),
      };
    },
  );
  server.get(
    "/api/apps/:appId/integrations",
    { preHandler: admin },
    async (request) => {
      await appFor(request);
      const demo = commerce.options.demoPayments === true && !production;
      return {
        apple: {
          configured: !!(
            apple.options.clientId &&
            apple.options.teamId &&
            apple.options.keyId &&
            apple.options.privateKey &&
            apple.options.callbackUrl &&
            apple.options.returnUrls?.length
          ),
        },
        razorpay: {
          configured: !!(
            commerce.options.razorpayKeyId &&
            commerce.options.razorpayKeySecret &&
            commerce.options.razorpayWebhookSecret &&
            commerce.options.razorpayReturnUrl
          ),
        },
        database: store.kind === "postgres",
        externalDatabase: !!data.environmentDatabase.url,
        email: !!auth.mail,
        google: {
          configured: !!(
            oauth.options.clientId &&
            oauth.options.clientSecret &&
            oauth.options.callbackUrl &&
            oauth.options.returnUrls?.length
          ),
        },
        payments: {
          configured:
            demo ||
            !!(
              commerce.options.stripeKey &&
              commerce.options.stripeReturnUrl &&
              commerce.options.stripeWebhookSecret
            ),
          demo,
        },
        push: !!push.options.account,
      };
    },
  );
  server.post("/api/apps", { preHandler: admin }, async (request, reply) => {
    const name = String(request.body?.name || "Untitled app").trim();
    if (!name || name.length > 100)
      throw failure(400, "App name is required (up to 100 characters).");
    const appId = id(),
      cid = id(),
      connection = {
        id: cid,
        app_id: appId,
        name: "App database (PostgreSQL)",
        kind: "managed",
        config: vault.seal({}),
      };
    const initial =
      request.body?.template === "commerce"
        ? createCommerceTemplate()
        : request.body?.template === "blank"
          ? {
              schemaVersion: 1,
              initialScreen: "main",
              screens: [
                {
                  id: "main",
                  name: "Main",
                  public: true,
                  tree: {
                    type: "scaffold",
                    body: {
                      type: "safeArea",
                      child: { type: "column", children: [] },
                    },
                  },
                },
              ],
            }
          : starter(cid);
    if (Object.hasOwn(request.body || {}, "theme"))
      initial.theme = request.body.theme;
    if (Object.hasOwn(request.body || {}, "darkTheme"))
      initial.darkTheme = request.body.darkTheme;
    if (Object.hasOwn(request.body || {}, "themeMode"))
      initial.themeMode = request.body.themeMode;
    const definition = parseDefinition(initial);
    await store.transaction(async () => {
      await store.run(
        "INSERT INTO apps VALUES(?,?,?,?,1,NULL,?)",
        appId,
        request.admin.admin_id,
        name,
        JSON.stringify(definition),
        new Date().toISOString(),
      );
      await store.run(
        "INSERT INTO connections VALUES(?,?,?,?,?)",
        cid,
        appId,
        connection.name,
        connection.kind,
        connection.config,
      );
      await data.initializeManaged(connection, {
        seed: request.body?.template !== "blank",
      });
      if (definition.features?.includes("commerce")) await commerce.seed(appId);
    });
    reply.code(201);
    return {
      ...summary(await store.one("SELECT * FROM apps WHERE id=?", appId)),
      draft: definition,
    };
  });
  server.get("/api/apps/:appId", { preHandler: admin }, async (request) => {
    const app = await appFor(request);
    return { ...summary(app), draft: JSON.parse(app.draft) };
  });
  server.put(
    "/api/apps/:appId/draft",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        doc = parseDefinition(request.body?.document);
      if (request.body.revision !== app.revision)
        throw failure(
          409,
          "This draft changed in another tab. Reload before saving.",
        );
      const changed = await store.run(
        "UPDATE apps SET draft=?,revision=revision+1 WHERE id=? AND revision=?",
        JSON.stringify(doc),
        app.id,
        app.revision,
      );
      if (!changed.changes)
        throw failure(
          409,
          "This draft changed in another tab. Your recovery copy is kept; reload before saving.",
        );
      return {
        ...summary(await store.one("SELECT * FROM apps WHERE id=?", app.id)),
        draft: doc,
      };
    },
  );
  server.post(
    "/api/apps/:appId/preview",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        source = request.body?.source === "published" ? "published" : "draft";
      const release =
        source === "published"
          ? await store.one(
              "SELECT document,version FROM releases WHERE app_id=? AND version=?",
              app.id,
              app.published || 0,
            )
          : null;
      if (source === "published" && !release)
        throw failure(
          404,
          "Publish your first version before comparing the app.",
        );
      const previewApp = release
        ? {
            ...app,
            runtimeDependencies: await releaseDependencies(store, vault, {
              ...app,
              published: release.version,
            }),
          }
        : app;
      const doc = release
        ? JSON.parse(release.document)
        : request.body?.document
          ? parseDefinition(request.body.document)
          : JSON.parse(app.draft);
      const screen = request.body?.screenId
        ? resolveScreen(doc, request.body.screenId)
        : resolveScreen(doc, doc.initialScreen);
      if (!screen)
        throw failure(
          404,
          "This screen is not in the selected version. Switch to Draft to edit it.",
        );
      const database = request.body?.dataMode === "database",
        warnings = [];
      const user =
        database && request.body?.userId
          ? await store.one(
              "SELECT id,name,email FROM runtime_users WHERE app_id=? AND id=?",
              app.id,
              request.body.userId,
            )
          : null;
      let previewUserId = user?.id || null,
        previewAuthUser = user || null;
      let parameters;
      try {
        parameters = screenParameters(
          screen,
          screenQuery(
            doc,
            request.body?.screenId || doc.initialScreen,
            screen,
            request.body?.query || {},
            { preview: true, user },
          ),
          {
            preview: true,
          },
        );
      } catch (error) {
        throw failure(400, error.message);
      }
      const state = {
        ...screen.state,
        ...(database ? {} : request.body?.sampleState),
        ...(database ? {} : screen.previewData),
        params: parameters,
      };
      if (database) {
        previewUserId = user?.id || null;
        previewAuthUser = user || null;
        if (screen.loader && doc.features?.includes("commerce")) {
          if (screen.public || user)
            Object.assign(
              state,
              await commerce.screen(screen.loader, app, user, parameters),
            );
          else
            warnings.push(
              "Choose an app user in Data to preview cart, orders or notifications.",
            );
        }
        for (const source of screen.httpQueries || []) {
          const { endpoint } = await httpServices.get(
            previewApp,
            source.serviceId,
            source.endpointId,
          );
          if (!endpoint.public && !user)
            warnings.push(
              `Choose an app user to preview API source ${source.id}.`,
            );
          else
            Object.assign(
              state,
              await httpServices.screen(
                previewApp,
                user,
                { ...screen, httpQueries: [source] },
                parameters,
              ),
            );
        }
        const memo = new Map();
        for (const query of screen.queries) {
          if (query.scope === "user" && !user) {
            warnings.push(
              `Choose an app user in Data to preview ${query.id}. Private data has not been loaded.`,
            );
            continue;
          }
          const { id: queryId, ...identity } = query,
            fingerprint = JSON.stringify(identity);
          let result = memo.get(fingerprint);
          if (!result) {
            result = await data.read(
              await connectionFor(app, query.connectionId),
              query,
              {
                user,
                query: parameters,
                version: release?.version || "draft",
                screenId: screen.id,
              },
            );
            memo.set(fingerprint, result);
          }
          state[queryId] = query.single
            ? result.items[0] || null
            : result.items;
          if (!query.single) state[`${queryId}Page`] = result;
        }
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
      const componentId = source === "draft" ? request.body?.componentId : null;
      const overlayId = source === "draft" ? request.body?.overlayId : null;
      const overlay = overlayId
        ? openingOverlays(screen.onLoad).find((root) => root.id === overlayId)
        : null;
      if (overlayId && !overlay)
        throw failure(400, "Choose an opening overlay from this screen.");
      const expanded = expandPreviewTree(
        componentId
          ? { type: "component", componentId, id: "preview" }
          : overlay
            ? { type: "scaffold", body: { type: "center", child: overlay } }
            : composeScreen(doc, screen),
        doc,
      );
      return {
        success: true,
        schemaVersion: 1,
        screenId: screen.id,
        componentId: componentId || null,
        overlayId: overlay?.id || null,
        onLoad: expandAction(screen.onLoad, doc),
        theme: doc.theme,
        darkTheme: doc.darkTheme,
        themeMode: doc.themeMode,
        state: componentId
          ? componentPreviewState(
              doc.components.find((c) => c.id === componentId),
              state,
            )
          : state,
        preview: {
          source,
          version: release?.version || null,
          dataMode: database ? "database" : "sample",
          userId: previewUserId,
          user: previewAuthUser,
          warnings,
        },
        ...expanded,
        ...(source === "published" ? { sourceMap: {} } : {}),
      };
    },
  );
  server.get(
    "/api/apps/:appId/connections",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      return await store.all(
        "SELECT id,name,kind FROM connections WHERE app_id=?",
        app.id,
      );
    },
  );
  server.post(
    "/api/apps/:appId/connections",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        body = request.body || {};
      if (body.kind !== "postgres")
        throw failure(
          400,
          "Choose a PostgreSQL connection. The managed demo database is already available.",
        );
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 100
      )
        throw failure(400, "Connection name is required.");
      if (body.env !== undefined && body.env !== "APP_DATABASE_URL")
        throw failure(
          400,
          "Only APP_DATABASE_URL may be used as a database environment reference.",
        );
      const config = body.env
        ? { env: "APP_DATABASE_URL" }
        : {
            url: body.url,
            tls: body.tls !== false,
            ...(body.ca ? { ca: body.ca } : {}),
          };
      data.validatePostgres(data.resolveConfig(config));
      const connection = {
        id: id(),
        app_id: app.id,
        name: body.name,
        kind: "postgres",
        config: vault.seal(config),
      };
      try {
        await data.tables(connection);
      } catch {
        const pool = data.pools.get(connection.id);
        if (pool) await pool.end();
        data.pools.delete(connection.id);
        throw failure(
          400,
          "Unable to connect. Check host, credentials, TLS and database permissions.",
        );
      }
      await store.run(
        "INSERT INTO connections VALUES(?,?,?,?,?)",
        connection.id,
        app.id,
        connection.name,
        connection.kind,
        connection.config,
      );
      await audit(app.id, request.admin.admin_id, "connection.created");
      return {
        id: connection.id,
        name: connection.name,
        kind: connection.kind,
      };
    },
  );
  server.get(
    "/api/apps/:appId/connections/:connectionId/tables",
    { preHandler: admin },
    async (request) =>
      await data.tables(
        await connectionFor(await appFor(request), request.params.connectionId),
      ),
  );
  server.get(
    "/api/apps/:appId/connections/:connectionId/tables/:table",
    { preHandler: admin },
    async (request) =>
      await data.columns(
        await connectionFor(await appFor(request), request.params.connectionId),
        request.params.table,
      ),
  );
  server.get(
    "/api/apps/:appId/keys",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      return await store.all(
        "SELECT id,label,prefix,revoked,created FROM runtime_keys WHERE app_id=? ORDER BY created DESC",
        app.id,
      );
    },
  );
  server.post(
    "/api/apps/:appId/keys",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      return await keyCreate(
        app,
        String(request.body?.label || "Production").slice(0, 100),
      );
    },
  );
  server.post(
    "/api/apps/:appId/keys/:keyId/revoke",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      if (
        !(
          await store.run(
            "UPDATE runtime_keys SET revoked=1 WHERE id=? AND app_id=?",
            request.params.keyId,
            app.id,
          )
        ).changes
      )
        throw failure(404, "Key not found.");
      await audit(app.id, request.admin.admin_id, "key.revoked");
      return { success: true };
    },
  );
  server.post(
    "/api/apps/:appId/keys/:keyId/rotate",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        old = await store.one(
          "SELECT * FROM runtime_keys WHERE id=? AND app_id=? AND revoked=0",
          request.params.keyId,
          app.id,
        );
      if (!old) throw failure(404, "Active key not found.");
      return await store.transaction(async () => {
        const next = await keyCreate(app, old.label);
        await store.run("UPDATE runtime_keys SET revoked=1 WHERE id=?", old.id);
        return next;
      });
    },
  );
  server.get(
    "/api/apps/:appId/releases",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      return await store.all(
        "SELECT id,version,checksum,created FROM releases WHERE app_id=? ORDER BY version DESC",
        app.id,
      );
    },
  );
  server.post(
    "/api/apps/:appId/releases",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      if (request.body?.revision !== app.revision)
        throw failure(
          409,
          "Save and reload the latest draft before publishing.",
        );
      const doc = parseDefinition(JSON.parse(app.draft));
      await validateDocument(app, doc);
      return await store.transaction(async () => {
        const current = await store.one(
          "SELECT revision FROM apps WHERE id=?",
          app.id,
        );
        if (current.revision !== app.revision)
          throw failure(409, "Draft changed while publishing. Try again.");
        const version =
          ((
            await store.one(
              "SELECT MAX(version) AS n FROM releases WHERE app_id=?",
              app.id,
            )
          ).n || 0) + 1;
        const document = JSON.stringify(doc),
          created = new Date().toISOString();
        await store.run(
          "INSERT INTO releases VALUES(?,?,?,?,?,?)",
          id(),
          app.id,
          version,
          document,
          hash(document),
          created,
        );
        await store.run(
          "UPDATE apps SET published=? WHERE id=?",
          version,
          app.id,
        );
        await captureDependencies(store, vault, app.id, version);
        await audit(
          app.id,
          request.admin.admin_id,
          `release.published:${version}`,
        );
        return { success: true, version, created };
      });
    },
  );
  server.post(
    "/api/apps/:appId/releases/:version/activate",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        version = Number(request.params.version);
      if (
        !(await store.one(
          "SELECT id FROM releases WHERE app_id=? AND version=?",
          app.id,
          version,
        ))
      )
        throw failure(404, "Release not found.");
      await store.run(
        "UPDATE apps SET published=? WHERE id=?",
        version,
        app.id,
      );
      await audit(
        app.id,
        request.admin.admin_id,
        `release.activated:${version}`,
      );
      return { success: true, version };
    },
  );
  server.get(
    "/api/apps/:appId/outbox",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      if (production) throw failure(404, "Not available.");
      return (
        await store.all(
          "SELECT * FROM outbox WHERE app_id=? ORDER BY created DESC LIMIT 30",
          app.id,
        )
      ).map((x) => ({
        id: x.id,
        created: x.created,
        ...vault.open(x.content),
      }));
    },
  );
  server.get(
    "/api/apps/:appId/users",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      return await store.all(
        "SELECT id,email,name,verified FROM runtime_users WHERE app_id=? ORDER BY email LIMIT 500",
        app.id,
      );
    },
  );
  server.post(
    "/api/apps/:appId/query-preview",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request),
        doc = request.body?.document
          ? parseDefinition(request.body.document)
          : JSON.parse(app.draft),
        screen = doc.screens.find((s) => s.id === request.body?.screenId),
        query = screen?.queries.find((q) => q.id === request.body?.queryId);
      if (!query) throw failure(404, "Data source not found.");
      const user = request.body.userId
        ? await store.one(
            "SELECT id,name,email FROM runtime_users WHERE app_id=? AND id=?",
            app.id,
            request.body.userId,
          )
        : null;
      if (query.scope === "user" && !user)
        throw failure(400, "Choose an app user to preview private records.");
      return await data.read(
        await connectionFor(app, query.connectionId),
        query,
        {
          user,
          query: screenParameters(screen, request.body.query || {}, {
            preview: true,
          }),
          version: "draft",
          screenId: screen.id,
        },
      );
    },
  );
  server.get(
    "/api/apps/:appId/audit",
    { preHandler: admin },
    async (request) => {
      const app = await appFor(request);
      return await store.all(
        "SELECT event,created FROM audit WHERE app_id=? ORDER BY created DESC LIMIT 100",
        app.id,
      );
    },
  );

  await registerRuntimeRoutes(server, {
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
  });

  const studioRoot = fileURLToPath(new URL("../", import.meta.url));
  const webRoot = options.webRoot || resolve(studioRoot, "dist");
  if (existsSync(webRoot)) {
    await server.register(staticPlugin, {
      root: webRoot,
      prefix: "/",
      wildcard: false,
      globIgnore: ["flutter-preview/**"],
    });
    server.setNotFoundHandler((request, reply) => {
      if (
        request.url.startsWith("/api") ||
        request.url.startsWith("/runtime") ||
        request.url.startsWith("/flutter-preview")
      )
        return reply
          .code(404)
          .send({ success: false, message: "Endpoint not found." });
      return reply.sendFile("index.html");
    });
  }
  server.post("/integrations/apple/callback", async (request, reply) => {
    const target = await apple.callback(request.body || {});
    return reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer")
      .redirect(target.toString());
  });
  server.get("/integrations/google/callback", async (request, reply) => {
    const target = await oauth.callback(request.query);
    reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer");
    return reply.redirect(target.toString());
  });
  await server.register(async (integration) => {
    integration.removeContentTypeParser("application/json");
    integration.addContentTypeParser(
      "application/json",
      { parseAs: "buffer", bodyLimit: 1024 * 1024 },
      (request, body, done) => done(null, body),
    );
    integration.post(
      "/integrations/razorpay/:appId/webhook",
      async (request) => {
        const event = commerce.razorpay.webhook(
          request.body,
          request.headers["x-razorpay-signature"],
        );
        if (
          ![
            "payment_link.paid",
            "payment_link.cancelled",
            "payment_link.expired",
          ].includes(event.event)
        )
          return { received: true };
        const eventId = request.headers["x-razorpay-event-id"];
        if (typeof eventId !== "string" || !eventId || eventId.length > 200)
          throw failure(400, "Missing Razorpay event ID.");
        const key = `razorpay:${request.params.appId}:${eventId}`,
          link = event.payload?.payment_link?.entity;
        if (link?.notes?.appId !== request.params.appId)
          throw failure(400, "Webhook app does not match.");
        await store.transaction(async () => {
          if (await store.one("SELECT id FROM commerce_events WHERE id=?", key))
            return;
          const row = await store.one(
            "SELECT * FROM commerce_orders WHERE app_id=? AND id=? AND mode='razorpay'",
            request.params.appId,
            link.notes.orderId,
          );
          if (!row) throw failure(404, "Payment order not found.");
          await commerce.razorpay.apply(row, link);
          await store.run(
            "INSERT INTO commerce_events VALUES(?,?)",
            key,
            Date.now(),
          );
        });
        return { received: true };
      },
    );
    integration.post("/integrations/stripe/:appId/webhook", async (request) => {
      const event = commerce.verifyWebhook(
        request.body,
        request.headers["stripe-signature"],
      );
      if (!event.id || typeof event.id !== "string")
        throw failure(400, "Invalid webhook event.");
      if (
        ![
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "checkout.session.expired",
        ].includes(event.type)
      )
        return { received: true };
      const session = event.data?.object;
      if (session?.metadata?.appId !== request.params.appId)
        throw failure(400, "Webhook app does not match.");
      {
        if (
          await store.one("SELECT id FROM commerce_events WHERE id=?", event.id)
        )
          return { received: true };
        if (
          [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
          ].includes(event.type) &&
          session.payment_status === "paid"
        )
          await commerce.confirm(
            request.params.appId,
            session.metadata.orderId,
            session,
          );
        if (event.type === "checkout.session.expired") {
          const row = await store.one(
            "SELECT * FROM commerce_orders WHERE app_id=? AND id=? AND (session_id=? OR session_id IS NULL)",
            request.params.appId,
            session.metadata.orderId,
            session.id,
          );
          if (row) await commerce.release(row);
        }
        await store.run(
          "INSERT OR IGNORE INTO commerce_events VALUES(?,?)",
          event.id,
          Date.now(),
        );
      }
      return { received: true };
    });
  });
  const commerceRoot =
    options.commerceRoot ||
    resolve(studioRoot, "../example/build/commerce-web");
  if (existsSync(commerceRoot))
    await server.register(staticPlugin, {
      root: commerceRoot,
      prefix: "/commerce-demo/",
      decorateReply: false,
    });
  const previewRoot =
    options.previewRoot || resolve(studioRoot, "public/flutter-preview");
  if (existsSync(previewRoot))
    await server.register(staticPlugin, {
      root: previewRoot,
      prefix: "/flutter-preview/",
      decorateReply: false,
      setHeaders: (response) => response.header("Cache-Control", "no-cache"),
    });
  server.addHook("onClose", async () => {
    clearInterval(pushTimer);
    await pushPending;
    await data.close();
    await store.close();
  });
  return server;
}
