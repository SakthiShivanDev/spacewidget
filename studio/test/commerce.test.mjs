import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { fixture } from "./helpers.mjs";
const register = async (f, address = "buyer@example.com") => {
  const r = await f.call(
    "POST",
    "/runtime/auth/register",
    { name: "Buyer", email: address, password: "buyer-secure-password" },
    f.runtime,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return { ...f.runtime, authorization: `Bearer ${r.data.data.accessToken}` };
};
async function commerce(t, options = {}) {
  const f = await fixture(t, {
    template: "commerce",
    demoPayments: true,
    ...options,
  });
  assert.equal((await f.publish()).status, 200);
  return f;
}
async function order(f, headers, quantity = 1) {
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/cart",
        { productId: "headphones", quantity },
        headers,
      )
    ).status,
    200,
  );
  const cart = (
    await f.call("GET", "/runtime/commerce/cart", undefined, headers)
  ).data.data.cart;
  const body = {
    idempotencyKey: cart.checkoutKey,
    address: "123 Market Street, Test City",
    total: 1,
    userId: "attacker",
  };
  const result = await f.call(
    "POST",
    "/runtime/commerce/checkout",
    body,
    headers,
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return { result: result.data.data, body };
}
test("commerce customer journey uses server totals, idempotency, stock, ownership and payment confirmation", async (t) => {
  const f = await commerce(t),
    user = await register(f),
    other = await register(f, "other@example.com");
  const start = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(start.data.state.products.length, 3);
  assert.equal(
    (
      await f.call(
        "GET",
        "/runtime/screens/shop?q=studio&category=Audio",
        undefined,
        f.runtime,
      )
    ).data.state.products.length,
    1,
  );
  assert.equal(
    (await f.call("GET", "/runtime/screens/cart", undefined, f.runtime)).status,
    401,
  );
  const { result, body } = await order(f, user, 2),
    id = result.order.id;
  assert.equal(result.order.totalCents, 17800);
  assert.equal(result.order.status, "pending");
  const replay = await f.call("POST", "/runtime/commerce/checkout", body, user);
  assert.equal(replay.data.data.order.id, id);
  assert.equal(
    (
      await f.server.store.one(
        "SELECT stock FROM commerce_products WHERE app_id=? AND id='headphones'",
        f.app.id,
      )
    ).stock,
    22,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/checkout",
        { ...body, address: "Different delivery address" },
        user,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/verify",
        { orderId: id, payment_status: "paid" },
        user,
      )
    ).data.data.order.status,
    "pending",
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/demo-confirm",
        { orderId: id },
        other,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.call(
        "GET",
        `/runtime/screens/order?orderId=${id}`,
        undefined,
        other,
      )
    ).status,
    404,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.call(
          "POST",
          "/runtime/commerce/demo-confirm",
          { orderId: id },
          user,
        )
      ).data.data.order.status,
      "paid",
    );
  assert.equal(
    (
      await f.server.store.one(
        "SELECT COUNT(*) AS n FROM commerce_notifications WHERE app_id=?",
        f.app.id,
      )
    ).n,
    1,
  );
  assert.equal(
    (await f.call("POST", "/runtime/commerce/cancel", { orderId: id }, user))
      .status,
    409,
  );
  assert.equal(
    (await f.call("GET", "/runtime/screens/orders", undefined, user)).data.state
      .orders[0].totalLabel,
    "USD 178.00",
  );
});
test("concurrent carts cannot oversell, cancellation releases exactly once and stale cart keys fail", async (t) => {
  const f = await commerce(t),
    user = await register(f),
    other = await register(f, "other@example.com");
  await f.server.store.run(
    "UPDATE commerce_products SET stock=1 WHERE app_id=? AND id='headphones'",
    f.app.id,
  );
  await f.call(
    "POST",
    "/runtime/commerce/cart",
    { productId: "headphones", quantity: 1 },
    other,
  );
  const cart = (await f.call("GET", "/runtime/commerce/cart", undefined, other))
    .data.data.cart;
  const first = await order(f, user);
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/checkout",
        {
          idempotencyKey: cart.checkoutKey,
          address: "123 Market Street, Other City",
        },
        other,
      )
    ).status,
    409,
  );
  assert.equal(
    (await f.call("GET", "/runtime/commerce/cart", undefined, other)).data.data
      .cart.items.length,
    1,
  );
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.call(
          "POST",
          "/runtime/commerce/cancel",
          { orderId: first.result.order.id },
          user,
        )
      ).data.data.order.status,
      "cancelled",
    );
  assert.equal(
    (
      await f.server.store.one(
        "SELECT stock FROM commerce_products WHERE app_id=? AND id='headphones'",
        f.app.id,
      )
    ).stock,
    1,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/cart",
        { productId: "headphones", quantity: 1.5 },
        user,
      )
    ).status,
    400,
  );
});
test("live Stripe checkout retries use the same session and signed webhooks fulfil once", async (t) => {
  const sessions = new Map(),
    calls = [];
  const providerFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/checkout/sessions") && options.method === "POST") {
      const p = options.body;
      const session = {
        id: "cs_test_session",
        url: "https://checkout.stripe.com/test",
        status: "open",
        payment_status: "unpaid",
        amount_total: Number(p.get("line_items[0][price_data][unit_amount]")),
        currency: "usd",
        metadata: {
          appId: p.get("metadata[appId]"),
          orderId: p.get("metadata[orderId]"),
        },
      };
      sessions.set(session.id, session);
      return Response.json(session);
    }
    return Response.json(sessions.get(url.split("/").at(-1)));
  };
  const secret = "whsec_test_only",
    f = await commerce(t, {
      demoPayments: false,
      stripeKey: "sk_test_not_real",
      stripeReturnUrl: "https://app.example.com/payment-return",
      stripeWebhookSecret: secret,
      providerFetch,
    }),
    user = await register(f);
  const { result } = await order(f, user),
    id = result.order.id;
  assert.equal(result.checkoutUrl, "https://checkout.stripe.com/test");
  await f.call("POST", "/runtime/commerce/checkout", { orderId: id }, user);
  assert.equal(
    calls.filter((c) => c.url.endsWith("/checkout/sessions")).length,
    1,
  );
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/demo-confirm",
        { orderId: id },
        user,
      )
    ).status,
    403,
  );
  const session = sessions.get("cs_test_session");
  session.payment_status = "paid";
  session.status = "complete";
  const event = JSON.stringify({
      id: "evt_test_paid",
      type: "checkout.session.completed",
      data: { object: session },
    }),
    stamp = Math.floor(Date.now() / 1000),
    signature = createHmac("sha256", secret)
      .update(`${stamp}.${event}`)
      .digest("hex");
  assert.equal(
    (
      await f.call(
        "POST",
        `/integrations/stripe/${f.app.id}/webhook`,
        JSON.parse(event),
        { "stripe-signature": "bad" },
      )
    ).status,
    400,
  );
  // inject raw bytes to test the exact provider payload, rather than a re-serialized object.
  for (let i = 0; i < 2; i++) {
    const r = await f.server.inject({
      method: "POST",
      url: `/integrations/stripe/${f.app.id}/webhook`,
      payload: event,
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${stamp},v1=${signature}`,
      },
    });
    assert.equal(r.statusCode, 200, r.body);
  }
  assert.equal(
    (await f.call("POST", "/runtime/commerce/verify", { orderId: id }, user))
      .data.data.order.status,
    "paid",
  );
  assert.equal(
    (
      await f.server.store.one(
        "SELECT COUNT(*) AS n FROM commerce_notifications",
      )
    ).n,
    1,
  );
});
test("production never enables simulated payment and refuses unconfigured providers", async (t) => {
  const f = await commerce(t, { production: true, demoPayments: true }),
    user = await register(f);
  await f.call(
    "POST",
    "/runtime/commerce/cart",
    { productId: "headphones", quantity: 1 },
    user,
  );
  const cart = (await f.call("GET", "/runtime/commerce/cart", undefined, user))
    .data.data.cart;
  assert.equal(
    (
      await f.call(
        "POST",
        "/runtime/commerce/checkout",
        {
          idempotencyKey: cart.checkoutKey,
          address: "123 Market Street, Test City",
        },
        user,
      )
    ).status,
    503,
  );
  assert.equal(
    (await f.server.store.one("SELECT COUNT(*) AS n FROM commerce_orders")).n,
    0,
  );
});

test("reference storefront keeps featured products, category filtering, search and price sorting connected", async (t) => {
  const f = await commerce(t);
  const start = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(start.status, 200);
  assert.deepEqual(
    start.data.state.displayProducts.map((p) => p.id),
    ["lamp", "backpack"],
  );
  assert.equal(start.data.state.categorySelection.all, true);
  for (const product of start.data.state.displayProducts)
    assert.ok(product.image.startsWith("data:image/jpeg;base64,"));
  const search = await f.call(
    "GET",
    "/runtime/commerce/products?q=backpack",
    undefined,
    f.runtime,
  );
  assert.deepEqual(
    search.data.data.products.map((p) => p.id),
    ["backpack"],
  );
  const home = await f.call(
    "GET",
    "/runtime/commerce/products?category=Home",
    undefined,
    f.runtime,
  );
  assert.deepEqual(
    home.data.data.products.map((p) => p.id),
    ["lamp"],
  );
  assert.equal(home.data.data.categorySelection.home, true);
  assert.equal(home.data.data.categorySelection.all, false);
  const all = await f.call(
    "GET",
    "/runtime/commerce/products?sort=priceAsc",
    undefined,
    f.runtime,
  );
  assert.deepEqual(
    all.data.data.products.map((p) => p.priceCents),
    [4200, 6400, 8900],
  );
});
