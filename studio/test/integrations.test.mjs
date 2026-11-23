import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.mjs";
import { pkce } from "../server/oauth.mjs";

test("Google OAuth exchanges one-time PKCE handoff codes and rejects verifier/state replay", async (t) => {
  let nonce;
  const f = await fixture(t, {
    googleClientId: "test-client",
    googleClientSecret: "not-real",
    googleCallbackUrl:
      "https://studio.example.com/integrations/google/callback",
    authReturnUrls: ["spacewidget://app/auth-return"],
    providerFetch: async () => Response.json({ id_token: "test-id-token" }),
    verifyGoogleToken: async () => ({
      sub: "google-subject",
      email: "google@example.com",
      email_verified: true,
      name: "Google Buyer",
      nonce,
    }),
  });
  const verifier = "a".repeat(43),
    body = {
      codeChallenge: pkce(verifier),
      returnUri: "spacewidget://app/auth-return",
    };
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/auth/oauth/google/start",
        { ...body, returnUri: "https://attacker.example" },
        f.runtime,
      )
    ).status,
    400,
  );
  const start = await f.call(
      "POST",
      "/runtime/auth/oauth/google/start",
      body,
      f.runtime,
    ),
    url = new URL(start.data.data.authorizationUrl);
  nonce = url.searchParams.get("nonce");
  assert.ok(url.searchParams.get("code_challenge"));
  const callback = await f.server.inject({
    url: `/integrations/google/callback?state=${url.searchParams.get("state")}&code=test-code`,
  });
  assert.equal(callback.statusCode, 302, callback.body);
  const returnUrl = new URL(callback.headers.location),
    code = returnUrl.searchParams.get("oauthCode");
  assert.ok(code);
  assert.ok(!returnUrl.searchParams.has("accessToken"));
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/auth/oauth/google/exchange",
        { code, codeVerifier: "b".repeat(43) },
        f.runtime,
      )
    ).status,
    401,
  );
  const session = await f.call(
    "POST",
    "/runtime/auth/oauth/google/exchange",
    { code, codeVerifier: verifier },
    f.runtime,
  );
  assert.equal(session.status, 200, JSON.stringify(session.data));
  assert.equal(session.data.data.user.emailVerified, true);
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/auth/oauth/google/exchange",
        { code, codeVerifier: verifier },
        f.runtime,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await f.server.inject({
        url: `/integrations/google/callback?state=${url.searchParams.get("state")}&code=test-code`,
      })
    ).statusCode,
    400,
  );
});
test("custom HTTP sources keep credentials server-side, combine startup data and enforce identity/method/origin", async (t) => {
  const calls = [],
    f = await fixture(t, {
      httpHosts: ["api.example.com"],
      httpFetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ items: [{ name: "Course", price: 49 }] });
      },
    });
  const configuration = {
    baseUrl: "https://api.example.com",
    headers: { Authorization: "Bearer secret-server-key" },
    endpoints: [
      { id: "courses", path: "/courses", method: "GET", public: true },
      { id: "book", path: "/book", method: "POST", public: false },
    ],
  };
  const saved = await f.call(
    "PUT",
    `/api/apps/${f.app.id}/http-services/school`,
    configuration,
    f.admin,
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.ok(!JSON.stringify(saved.data).includes("secret-server-key"));
  const doc = structuredClone(f.app.draft);
  doc.screens[0].httpQueries = [
    {
      id: "coursesApi",
      serviceId: "school",
      endpointId: "courses",
      query: { search: { from: "query", key: "q" } },
    },
  ];
  assert.equal((await f.save(doc)).status, 200);
  assert.equal((await f.publish()).status, 200);
  const start = await f.call(
    "GET",
    "/runtime/start?q=math",
    undefined,
    f.runtime,
  );
  assert.equal(start.data.state.coursesApi.items[0].name, "Course");
  assert.equal(calls[0].url.searchParams.get("search"), "math");
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer secret-server-key",
  );
  assert.ok(!JSON.stringify(start.data).includes("secret-server-key"));
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/http/school/book",
        { userId: "someone-else" },
        f.runtime,
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.call("GET", "/runtime/http/school/book", undefined, f.runtime))
      .status,
    405,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        `/api/apps/${f.app.id}/http-services/bad`,
        { ...configuration, baseUrl: "https://evil.example" },
        f.admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        `/api/apps/${f.app.id}/http-services/bad`,
        {
          ...configuration,
          endpoints: [
            {
              id: "escape",
              path: "//evil.example/path",
              method: "GET",
              public: true,
            },
          ],
        },
        f.admin,
      )
    ).status,
    400,
  );
});
test("push tokens are encrypted, bound to the current session, and revoked at logout", async (t) => {
  const f = await fixture(t);
  const registration = await f.call(
      "POST",
      "/runtime/auth/register",
      {
        name: "Buyer",
        email: "buyer@example.com",
        password: "buyer-long-password",
      },
      f.runtime,
    ),
    session = registration.data.data;
  const headers = {
      ...f.runtime,
      authorization: `Bearer ${session.accessToken}`,
    },
    token = "firebase-test-device-token-with-entropy";
  assert.equal(
    (await f.call("POST", "/runtime/push/devices", { token }, f.runtime))
      .status,
    401,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/push/devices",
        { token, platform: "android" },
        headers,
      )
    ).status,
    200,
  );
  const row = await f.server.store.one("SELECT * FROM push_devices");
  assert.notEqual(row.token, token);
  assert.equal(row.user_id, session.user.id);
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/push/notifications/nonexistent",
        undefined,
        headers,
      )
    ).status,
    404,
  );
  await f.call(
    "POST",
    "/runtime/auth/logout",
    { refreshToken: session.refreshToken },
    f.runtime,
  );
  assert.equal(
    (await f.server.store.one("SELECT COUNT(*) AS n FROM push_devices")).n,
    0,
  );
});

test("Firebase sender retries transient failures and sends only an owned notification ID", async (t) => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const sent = [];
  let attempts = 0;
  const f = await fixture(t, {
    template: "commerce",
    demoPayments: true,
    firebaseAccount: {
      client_email: "push@test.invalid",
      project_id: "test-project",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
    },
    providerFetch: async (url, options) => {
      if (url.includes("oauth2.googleapis.com"))
        return Response.json({
          access_token: "mock-firebase-access",
          expires_in: 3600,
        });
      sent.push(JSON.parse(options.body));
      attempts++;
      return attempts === 1
        ? Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 })
        : Response.json({ name: "projects/test/messages/one" });
    },
  });
  await f.publish();
  const registration = await f.call(
    "POST",
    "/runtime/auth/register",
    {
      name: "Buyer",
      email: "push-buyer@example.com",
      password: "push-buyer-password",
    },
    f.runtime,
  );
  const headers = {
    ...f.runtime,
    authorization: `Bearer ${registration.data.data.accessToken}`,
  };
  await f.call(
    "POST",
    "/runtime/push/devices",
    { token: "firebase-device-for-sender-test" },
    headers,
  );
  await f.call(
    "POST",
    "/runtime/commerce/cart",
    { productId: "lamp", quantity: 1 },
    headers,
  );
  const cart = (
    await f.call("GET", "/runtime/commerce/cart", undefined, headers)
  ).data.data.cart;
  const order = (
    await f.call(
      "POST",
      "/runtime/commerce/checkout",
      {
        idempotencyKey: cart.checkoutKey,
        address: "123 Market Street, Test City",
      },
      headers,
    )
  ).data.data.order;
  await f.call(
    "POST",
    "/runtime/commerce/demo-confirm",
    { orderId: order.id },
    headers,
  );
  await f.server.pushService.flush();
  assert.equal(
    (await f.server.store.one("SELECT completed FROM push_delivery")).completed,
    0,
  );
  await f.server.store.run("UPDATE push_delivery SET next_attempt=0");
  await f.server.pushService.flush();
  assert.equal(
    (await f.server.store.one("SELECT completed FROM push_delivery")).completed,
    1,
  );
  assert.equal(sent.length, 2);
  assert.equal(sent[1].message.token, "firebase-device-for-sender-test");
  assert.deepEqual(Object.keys(sent[1].message.data), ["notificationId"]);
  const destination = await f.call(
    "GET",
    `/runtime/push/notifications/${sent[1].message.data.notificationId}`,
    undefined,
    headers,
  );
  assert.equal(destination.data.data.query.orderId, order.id);
});
