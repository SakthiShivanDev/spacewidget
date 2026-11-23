import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHmac } from "node:crypto";
import { fixture } from "./helpers.mjs";
import { pkce } from "../server/oauth.mjs";
import { runJavaScript } from "../server/code.mjs";
import { databaseConfig } from "../server/store.mjs";
const register = async (f, email = "platform@example.com") => {
  const r = await f.call(
    "POST",
    "/runtime/auth/register",
    { email, name: "Platform user", password: "test-customer-password" },
    f.runtime,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return {
    user: r.data.data.user,
    headers: {
      ...f.runtime,
      authorization: `Bearer ${r.data.data.accessToken}`,
    },
  };
};
test("Studio requires PostgreSQL and verified remote TLS; no SQLite fallback", () => {
  for (const url of [
    undefined,
    ":memory:",
    "sqlite:data/studio.sqlite",
    "file:///tmp/test.sqlite",
  ])
    assert.throws(() => databaseConfig(url));
  assert.throws(() =>
    databaseConfig(
      "postgresql://user:password@database.example/test?sslmode=disable",
      { production: true },
    ),
  );
  assert.equal(
    databaseConfig("postgresql://user:password@database.example/test").ssl
      .rejectUnauthorized,
    true,
  );
});
for (const provider of ["openai", "gemini", "claude"])
  test(`${provider} BYOK uses structured output, encrypts credentials and creates an inert reviewed proposal`, async (t) => {
    let captured,
      malicious = false;
    const envelope = () =>
      JSON.stringify({
        name: "Learning overview",
        treeJson: JSON.stringify(
          malicious
            ? {
                type: "text",
                text: "Bad",
                onTap: { type: "request", source: "https://bad.example" },
              }
            : {
                type: "column",
                children: [{ type: "text", text: "Your courses" }],
              },
        ),
        stateJson: "{}",
      });
    const f = await fixture(t, {
      aiFetch: async (url, options) => {
        captured = { url, options };
        return Response.json(
          provider === "openai"
            ? {
                status: "completed",
                output: [
                  { content: [{ type: "output_text", text: envelope() }] },
                ],
              }
            : provider === "gemini"
              ? {
                  candidates: [
                    {
                      finishReason: "STOP",
                      content: { parts: [{ text: envelope() }] },
                    },
                  ],
                }
              : {
                  stop_reason: "end_turn",
                  content: [{ type: "text", text: envelope() }],
                },
        );
      },
    });
    const saved = await f.call(
      "PUT",
      `/api/ai/settings/${provider}`,
      { model: "test-model", apiKey: "secret-test-ai-key" },
      f.admin,
    );
    assert.equal(saved.status, 200);
    assert.ok(!JSON.stringify(saved.data).includes("secret-test-ai-key"));
    assert.ok(
      !(
        await f.server.store.one(
          "SELECT config FROM ai_credentials WHERE provider=?",
          provider,
        )
      ).config.includes("secret-test-ai-key"),
    );
    const proposal = await f.call(
      "POST",
      `/api/apps/${f.app.id}/ai/design`,
      { provider, target: "component", prompt: "Design a learning dashboard" },
      f.admin,
    );
    assert.equal(proposal.status, 200, JSON.stringify(proposal.data));
    assert.equal(proposal.data.tree.children[0].text, "Your courses");
    assert.equal(
      (
        await f.server.store.one(
          "SELECT revision FROM apps WHERE id=?",
          f.app.id,
        )
      ).revision,
      f.app.revision,
    );
    assert.ok(!captured.options.body.includes("secret-test-ai-key"));
    assert.ok(!captured.options.body.includes("platform@example.com"));
    if (provider === "openai") {
      const body = JSON.parse(captured.options.body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.strict, true);
    }
    malicious = true;
    assert.equal(
      (
        await f.call(
          "POST",
          `/api/apps/${f.app.id}/ai/design`,
          { provider, prompt: "Generate this unsafe design" },
          f.admin,
        )
      ).status,
      502,
    );
    assert.equal(
      (
        await f.call(
          "PUT",
          `/api/ai/settings/${provider}`,
          { remove: true },
          f.admin,
        )
      ).data.length,
      0,
    );
  });
test("AI provider errors never echo keys or upstream bodies", async (t) => {
  const f = await fixture(t, {
    aiFetch: async () =>
      new Response("secret-test-ai-key provider debug", { status: 401 }),
  });
  await f.call(
    "PUT",
    "/api/ai/settings/openai",
    { model: "test-model", apiKey: "secret-test-ai-key" },
    f.admin,
  );
  const result = await f.call(
    "POST",
    `/api/apps/${f.app.id}/ai/design`,
    { provider: "openai", prompt: "Create a screen" },
    f.admin,
  );
  assert.equal(result.status, 502);
  assert.ok(!JSON.stringify(result.data).includes("secret-test-ai-key"));
});
test("backend JS isolates host APIs, stops runaway code and enables saved versions with server identity", async (t) => {
  assert.deepEqual(
    await runJavaScript(
      "(c) => ({value:c.input.a * 2, host:typeof process, network:typeof fetch})",
      { input: { a: 21 } },
    ),
    { value: 42, host: "undefined", network: "undefined" },
  );
  await assert.rejects(
    runJavaScript("() => { while(true) {} }", {}),
    /500 ms|deadline/,
  );
  await assert.rejects(runJavaScript("() => Promise.resolve(42)", {}));
  const f = await fixture(t),
    customer = await register(f),
    root = `/api/apps/${f.app.id}/code/calculate`,
    source = "(c) => ({ userId: c.user.id, total: c.input.quantity * 42 })";
  assert.equal(
    (await f.call("PUT", root, { kind: "javascript", source }, f.admin)).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/functions/calculate",
        { quantity: 2 },
        customer.headers,
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.call("POST", `${root}/publish`, { revision: 1 }, f.admin)).status,
    200,
  );
  assert.deepEqual(
    (
      await f.call(
        "POST",
        "/runtime/functions/calculate",
        { quantity: 2, user: { id: "spoof" } },
        customer.headers,
      )
    ).data.data,
    { userId: customer.user.id, total: 84 },
  );
  assert.equal(
    (await f.call("POST", "/runtime/functions/calculate", {}, f.runtime))
      .status,
    401,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        root,
        { kind: "javascript", source: "() => 7", revision: 1 },
        f.admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        root,
        { kind: "javascript", source, revision: 1 },
        f.admin,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/functions/calculate",
        { quantity: 3 },
        customer.headers,
      )
    ).data.data.total,
    126,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        `/api/apps/${f.app.id}/code/greeting`,
        {
          kind: "dart",
          source: 'Widget greeting(SpaceBuildContext c) => Text("Hello");',
        },
        f.admin,
      )
    ).status,
    200,
  );
  const exported = await f.server.inject({
    url: `/api/apps/${f.app.id}/code/greeting/export`,
    headers: f.admin,
  });
  assert.equal(exported.statusCode, 200);
  assert.match(exported.body, /Widget greeting/);
});
test("Apple OAuth validates nonce, isolates providers and claims callback once before PKCE handoff", async (t) => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  let nonce;
  const f = await fixture(t, {
    appleClientId: "apple-service",
    appleTeamId: "team",
    appleKeyId: "key",
    applePrivateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
    appleCallbackUrl: "https://studio.example/integrations/apple/callback",
    authReturnUrls: ["spacewidget://app/auth-return"],
    providerFetch: async (url, options) => {
      assert.equal(url, "https://appleid.apple.com/auth/token");
      assert.equal(options.body.get("client_secret").split(".").length, 3);
      return Response.json({ id_token: "mock" });
    },
    verifyAppleToken: async () => ({
      sub: "apple-subject",
      nonce,
      email: "apple@example.com",
      email_verified: "true",
    }),
  });
  const start = await f.call(
    "POST",
    "/runtime/auth/oauth/apple/start",
    {
      returnUri: "spacewidget://app/auth-return",
      codeChallenge: pkce("a".repeat(43)),
    },
    f.runtime,
  );
  assert.equal(start.status, 200, JSON.stringify(start.data));
  const url = new URL(start.data.data.authorizationUrl);
  nonce = url.searchParams.get("nonce");
  assert.equal(url.hostname, "appleid.apple.com");
  assert.equal(url.searchParams.get("response_mode"), "form_post");
  const body = { state: url.searchParams.get("state"), code: "test-code" };
  const callbacks = await Promise.all(
    [1, 2].map(() =>
      f.server.inject({
        method: "POST",
        url: "/integrations/apple/callback",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams(body).toString(),
      }),
    ),
  );
  assert.deepEqual(callbacks.map((r) => r.statusCode).sort(), [302, 400]);
  const code = new URL(
    callbacks.find((r) => r.statusCode === 302).headers.location,
  ).searchParams.get("oauthCode");
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/auth/oauth/google/exchange",
        { code, codeVerifier: "a".repeat(43) },
        f.runtime,
      )
    ).status,
    401,
  );
  const exchange = await f.call(
    "POST",
    "/runtime/auth/oauth/apple/exchange",
    { code, codeVerifier: "a".repeat(43) },
    f.runtime,
  );
  assert.equal(exchange.status, 200, JSON.stringify(exchange.data));
  assert.equal(exchange.data.data.user.email, "apple@example.com");
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/auth/oauth/apple/exchange",
        { code, codeVerifier: "a".repeat(43) },
        f.runtime,
      )
    ).status,
    401,
  );
});
test("external links and general push destinations are app-scoped and user-owned", async (t) => {
  const f = await fixture(t),
    first = await register(f),
    second = await register(f, "other@example.com");
  await f.publish();
  const root = `/api/apps/${f.app.id}`;
  assert.equal(
    (
      await f.call(
        "PUT",
        `${root}/app-links`,
        { links: [{ name: "Bad", url: "javascript:alert(1)" }] },
        f.admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        `${root}/app-links`,
        { links: [{ name: "Support", url: "https://wa.me/1234" }] },
        f.admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/integrations/app-links",
        undefined,
        f.runtime,
      )
    ).data.data.links[0].name,
    "Support",
  );
  const notification = {
    userId: first.user.id,
    title: "Your next lesson",
    body: "Continue your course",
    screenId: f.app.draft.initialScreen,
    query: { lesson: "1" },
  };
  assert.equal(
    (await f.call("POST", `${root}/push/send`, notification, f.admin)).data
      .confirmRequired,
    true,
  );
  assert.equal(
    (
      await f.server.store.one(
        "SELECT COUNT(*) AS count FROM commerce_notifications WHERE app_id=?",
        f.app.id,
      )
    ).count,
    0,
  );
  const sent = await f.call(
    "POST",
    `${root}/push/send`,
    { ...notification, confirm: true },
    f.admin,
  );
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.equal(
    (await f.call("GET", "/runtime/push/notifications", undefined, f.runtime))
      .status,
    401,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/push/notifications",
        undefined,
        first.headers,
      )
    ).data.data.items.length,
    1,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/push/notifications",
        undefined,
        second.headers,
      )
    ).data.data.items.length,
    0,
  );
  const destination = `/runtime/push/notifications/${sent.data.notificationId}`;
  assert.equal(
    (await f.call("GET", destination, undefined, second.headers)).status,
    404,
  );
  assert.deepEqual(
    (await f.call("GET", destination, undefined, first.headers)).data.data,
    { screenId: notification.screenId, query: { lesson: "1" } },
  );
});
test("Razorpay uses server totals, verifies fetched status and validates signed idempotent webhooks", async (t) => {
  let link,
    createCalls = 0;
  const secret = "razorpay-webhook-test";
  const f = await fixture(t, {
    template: "commerce",
    demoPayments: false,
    paymentProvider: "razorpay",
    paymentCurrency: "inr",
    razorpayKeyId: "rzp_test_key",
    razorpayKeySecret: "rzp_test_secret",
    razorpayWebhookSecret: secret,
    razorpayReturnUrl: "https://shop.example/payment-return",
    providerFetch: async (url, options) => {
      assert.match(options.headers.Authorization, /^Basic /);
      if (url.includes("?reference_id="))
        return Response.json({ payment_links: link ? [link] : [] });
      if (options.method === "POST" && url.endsWith("/payment_links")) {
        createCalls++;
        link = {
          ...JSON.parse(options.body),
          id: "plink_test",
          status: "created",
          short_url: "https://rzp.io/test",
          amount_paid: 0,
        };
        return Response.json(link);
      }
      if (url.endsWith("/cancel")) link.status = "cancelled";
      return Response.json(link);
    },
  });
  await f.publish();
  const customer = await register(f);
  await f.call(
    "POST",
    "/runtime/commerce/cart",
    { productId: "headphones", quantity: 2 },
    customer.headers,
  );
  const cart = (
    await f.call("GET", "/runtime/commerce/cart", undefined, customer.headers)
  ).data.data.cart;
  const body = {
    idempotencyKey: cart.checkoutKey,
    address: "123 Customer Road, Test City",
    total: 1,
  };
  const checkout = await f.call(
    "POST",
    "/runtime/commerce/checkout",
    body,
    customer.headers,
  );
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
  const order = checkout.data.data.order;
  assert.equal(link.amount, 17800);
  assert.equal(link.currency, "INR");
  assert.equal(order.mode, "razorpay");
  await f.call("POST", "/runtime/commerce/checkout", body, customer.headers);
  assert.equal(createCalls, 1);
  const verify = () =>
    f.call(
      "POST",
      "/runtime/commerce/verify",
      { orderId: order.id, status: "paid" },
      customer.headers,
    );
  assert.equal((await verify()).data.data.order.status, "pending");
  const event = () =>
    Buffer.from(
      JSON.stringify({
        event: "payment_link.paid",
        payload: { payment_link: { entity: link } },
      }),
    );
  const hook = (signature) =>
    f.server.inject({
      method: "POST",
      url: `/integrations/razorpay/${f.app.id}/webhook`,
      headers: {
        "content-type": "application/json",
        "x-razorpay-event-id": "event-test",
        "x-razorpay-signature":
          signature ||
          createHmac("sha256", secret).update(event()).digest("hex"),
      },
      payload: event(),
    });
  assert.equal((await hook("f".repeat(64))).statusCode, 400);
  link.status = "paid";
  link.amount_paid = link.amount;
  assert.equal((await hook()).statusCode, 200);
  assert.equal((await hook()).statusCode, 200);
  assert.equal((await verify()).data.data.order.status, "paid");
  assert.equal(
    (
      await f.server.store.one(
        "SELECT COUNT(*) AS count FROM commerce_notifications WHERE order_id=?",
        order.id,
      )
    ).count,
    1,
  );
});

test("HTTP updates preserve encrypted credentials and test requests require owned users and mutation confirmation", async (t) => {
  let captured;
  const f = await fixture(t, {
    httpHosts: ["api.example.com"],
    httpFetch: async (_url, options) => {
      captured = options;
      return Response.json({ name: "Connected product" });
    },
  });
  const root = `/api/apps/${f.app.id}/http-services/catalog`;
  await f.call(
    "PUT",
    root,
    {
      baseUrl: "https://api.example.com",
      headers: { Authorization: "secret-original" },
      endpoints: [
        { id: "products", path: "/products", method: "GET", public: true },
      ],
    },
    f.admin,
  );
  const update = await f.call(
    "PUT",
    root,
    {
      baseUrl: "https://api.example.com",
      endpoints: [
        { id: "products", path: "/products", method: "GET", public: true },
        { id: "book", path: "/book", method: "POST", public: false },
      ],
    },
    f.admin,
  );
  assert.equal(update.status, 200);
  assert.ok(!JSON.stringify(update.data).includes("secret-original"));
  const result = await f.call("POST", `${root}/products/test`, {}, f.admin);
  assert.equal(result.data.data.name, "Connected product");
  assert.equal(captured.headers.Authorization, "secret-original");
  assert.equal(
    (
      await f.call(
        "POST",
        `${root}/products/test`,
        { userId: "foreign-user" },
        f.admin,
      )
    ).status,
    400,
  );
  const customer = await register(f);
  assert.equal(
    (
      await f.call(
        "POST",
        `${root}/book/test`,
        { userId: customer.user.id },
        f.admin,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        `${root}/book/test`,
        { userId: customer.user.id, confirm: true },
        f.admin,
      )
    ).status,
    200,
  );
  assert.equal(captured.headers["X-Space-User-ID"], customer.user.id);
});

test("new platform routes enforce builder ownership and do not expose another builder AI settings", async (t) => {
  const f = await fixture(t);
  const { passwordHash } = await import("../server/security.mjs");
  await f.call(
    "PUT",
    "/api/ai/settings/openai",
    { apiKey: "owner-private-api-key", model: "test-model" },
    f.admin,
  );
  await f.server.store.run(
    "INSERT INTO admins(id,email,password) VALUES(?,?,?)",
    "other-builder",
    "other-builder@example.com",
    await passwordHash("other-secure-password"),
  );
  const login = await f.call("POST", "/api/login", {
    email: "other-builder@example.com",
    password: "other-secure-password",
  });
  const other = {
    cookie: `sw_studio=${login.response.cookies[0].value}`,
    "x-csrf-token": login.data.csrf,
  };
  assert.deepEqual(
    (await f.call("GET", "/api/ai/settings", undefined, other)).data,
    [],
  );
  for (const path of ["code", "app-links", "integrations", "http-services"])
    assert.equal(
      (await f.call("GET", `/api/apps/${f.app.id}/${path}`, undefined, other))
        .status,
      404,
    );
  assert.equal(
    (
      await f.call(
        "POST",
        `/api/apps/${f.app.id}/ai/design`,
        { provider: "openai", prompt: "Design a screen" },
        other,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.call(
        "PUT",
        `/api/apps/${f.app.id}/code/hijack`,
        { kind: "javascript", source: "() => 1" },
        other,
      )
    ).status,
    404,
  );
});

test("code worker limits concurrent jobs and rejects oversized results", async () => {
  const running = Array.from({ length: 4 }, () =>
    runJavaScript("() => { while(true) {} }", {}),
  );
  const finished = Promise.allSettled(running);
  await assert.rejects(
    runJavaScript("() => 1", {}),
    (error) => error.statusCode === 429,
  );
  await finished;
  await assert.rejects(runJavaScript('() => "x".repeat(300000)', {}));
  assert.equal(await runJavaScript("() => 42", {}), 42);
});
