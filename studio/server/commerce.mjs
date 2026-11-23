import { RazorpayPayments } from "./razorpay.mjs";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { failure, hash } from "./security.mjs";
import {
  storefrontProductImage,
  storefrontCategorySelection,
} from "./storefront.mjs";

const money = (cents, currency = "usd") =>
  `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
const positiveInt = (value, max = 99) => {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw failure(400, `Use a whole number between 1 and ${max}.`);
  return value;
};
export class CommerceService {
  constructor(store, options = {}) {
    this.store = store;
    this.options = options;
    this.fetch = options.fetch || fetch;
    this.razorpay = new RazorpayPayments(this);
    this.currency = String(options.currency || "usd").toLowerCase();
    if (
      !["usd", "inr", "eur", "gbp", "aud", "cad", "sgd"].includes(this.currency)
    )
      throw new Error(
        "PAYMENT_CURRENCY must use a supported two-decimal currency: usd, inr, eur, gbp, aud, cad or sgd.",
      );
  }
  async seed(appId) {
    const rows = [
      [
        "headphones",
        "Studio headphones",
        "Clear sound for focused work, with a comfortable all-day fit.",
        "Audio",
        8900,
        24,
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop",
      ],
      [
        "backpack",
        "Everyday backpack",
        "A durable carry for class, work and weekends.",
        "Accessories",
        6400,
        18,
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=600&auto=format&fit=crop",
      ],
      [
        "lamp",
        "Desk lamp",
        "Warm, adjustable light for your reading corner.",
        "Home",
        4200,
        31,
        "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=600&auto=format&fit=crop",
      ],
    ];
    for (const row of rows)
      await this.store.run(
        "INSERT OR IGNORE INTO commerce_products VALUES(?,?,?,?,?,?,?,?)",
        appId,
        ...row.slice(0, -1),
        storefrontProductImage(row[0]) || row.at(-1),
      );
  }
  requireUser(user) {
    if (!user) throw failure(401, "Sign in to continue.");
    return user;
  }
  product(row) {
    return {
      ...row,
      priceCents: row.price,
      inStock: row.stock > 0,
      priceLabel: money(row.price, this.currency),
    };
  }
  async catalog(app, query = {}) {
    const search = String(query.q || "")
        .trim()
        .slice(0, 100),
      category = String(query.category || "");
    const page = Math.max(
      1,
      Math.min(1000, Number.parseInt(query.page, 10) || 1),
    );
    const clauses = ["app_id=?"],
      values = [app.id];
    if (search) {
      clauses.push("strpos(lower(name),lower(?))>0");
      values.push(search);
    }
    if (category) {
      clauses.push("category=?");
      values.push(category);
    }
    const order =
      {
        priceAsc: "price ASC,id ASC",
        priceDesc: "price DESC,id ASC",
        name: "name ASC,id ASC",
      }[query.sort] || "name ASC,id ASC";
    const total = (
      await this.store.one(
        `SELECT COUNT(*) AS n FROM commerce_products WHERE ${clauses.join(" AND ")}`,
        ...values,
      )
    ).n;
    const products = (
      await this.store.all(
        `SELECT * FROM commerce_products WHERE ${clauses.join(" AND ")} ORDER BY ${order} LIMIT 12 OFFSET ?`,
        ...values,
        (page - 1) * 12,
      )
    ).map((row) => this.product(row));
    return {
      products,
      displayProducts: products.slice(0, 2),
      categories: (
        await this.store.all(
          "SELECT DISTINCT category FROM commerce_products WHERE app_id=? ORDER BY category",
          app.id,
        )
      ).map((r) => ({ label: r.category, value: r.category })),
      search,
      category,
      categorySelection: storefrontCategorySelection(category),
      page,
      total,
      hasMore: page * 12 < total,
    };
  }
  async cart(app, user) {
    this.requireUser(user);
    const items = (
      await this.store.all(
        "SELECT p.*,c.quantity FROM commerce_cart c JOIN commerce_products p ON p.app_id=c.app_id AND p.id=c.product_id WHERE c.app_id=? AND c.user_id=? ORDER BY p.id",
        app.id,
        user.id,
      )
    ).map((r) => ({
      ...this.product(r),
      lineTotal: money(r.price * r.quantity, this.currency),
    }));
    const total = items.reduce((n, p) => n + p.price * p.quantity, 0);
    const version =
      (
        await this.store.one(
          "SELECT version FROM commerce_cart_versions WHERE app_id=? AND user_id=?",
          app.id,
          user.id,
        )
      )?.version || 0;
    return {
      cart: {
        items,
        totalCents: total,
        totalLabel: money(total, this.currency),
        hasItems: items.length > 0,
        count: items.reduce((n, i) => n + i.quantity, 0),
        checkoutKey: `${user.id}:${version}`,
      },
      demoPayments:
        this.options.demoPayments === true && !this.options.production,
    };
  }
  async setCart(app, user, body) {
    this.requireUser(user);
    const quantity = body.quantity === 0 ? 0 : positiveInt(body.quantity);
    const product = await this.store.one(
      "SELECT * FROM commerce_products WHERE app_id=? AND id=?",
      app.id,
      String(body.productId),
    );
    if (!product) throw failure(404, "Product not found.");
    return await this.store.transaction(async () => {
      const old =
        (
          await this.store.one(
            "SELECT quantity FROM commerce_cart WHERE app_id=? AND user_id=? AND product_id=?",
            app.id,
            user.id,
            product.id,
          )
        )?.quantity || 0;
      const next = body.add === true ? old + quantity : quantity;
      if (next > 99 || next > product.stock)
        throw failure(409, "The requested quantity is no longer available.");
      if (next)
        await this.store.run(
          "INSERT INTO commerce_cart VALUES(?,?,?,?) ON CONFLICT(app_id,user_id,product_id) DO UPDATE SET quantity=excluded.quantity",
          app.id,
          user.id,
          product.id,
          next,
        );
      else
        await this.store.run(
          "DELETE FROM commerce_cart WHERE app_id=? AND user_id=? AND product_id=?",
          app.id,
          user.id,
          product.id,
        );
      await this.bump(app, user);
      return await this.cart(app, user);
    });
  }
  async bump(app, user) {
    await this.store.run(
      "INSERT INTO commerce_cart_versions VALUES(?,?,1) ON CONFLICT(app_id,user_id) DO UPDATE SET version=commerce_cart_versions.version+1",
      app.id,
      user.id,
    );
  }
  async order(app, user, orderId) {
    this.requireUser(user);
    const row = await this.store.one(
      "SELECT * FROM commerce_orders WHERE app_id=? AND user_id=? AND id=?",
      app.id,
      user.id,
      String(orderId),
    );
    if (!row) throw failure(404, "Order not found.");
    return row;
  }
  publicOrder(row) {
    return {
      id: row.id,
      totalLabel: money(row.total, row.currency),
      totalCents: row.total,
      currency: row.currency,
      status: row.status,
      pending: row.status === "pending",
      mode: row.mode,
      address: row.address,
      items: JSON.parse(row.items),
      sessionId: row.session_id,
      created: row.created,
    };
  }
  async createOrder(app, user, body) {
    this.requireUser(user);
    const key = String(body.idempotencyKey || ""),
      address = String(body.address || "").trim();
    if (
      !key ||
      key.length > 180 ||
      address.length < 10 ||
      address.length > 1000
    )
      throw failure(
        400,
        "Provide the checkout key and a delivery address of 10–1000 characters.",
      );
    if (body.provider && !["stripe", "razorpay"].includes(body.provider))
      throw failure(400, "Choose Stripe or Razorpay.");
    const mode =
      this.options.demoPayments === true && !this.options.production
        ? "demo"
        : String(body.provider || this.options.paymentProvider || "stripe");
    if (!["demo", "stripe", "razorpay"].includes(mode))
      throw failure(400, "Choose Stripe or Razorpay.");
    if (mode === "razorpay") this.razorpay.returnUrl();
    if (mode === "stripe") this.paymentReturn();
    const fingerprint = hash(JSON.stringify({ address, mode }));
    return await this.store.transaction(async () => {
      const existing = await this.store.one(
        "SELECT * FROM commerce_orders WHERE app_id=? AND user_id=? AND checkout_key=?",
        app.id,
        user.id,
        key,
      );
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw failure(
            409,
            "This checkout key was already used with different details.",
          );
        return existing;
      }
      const { cart } = await this.cart(app, user);
      if (key !== cart.checkoutKey)
        throw failure(409, "Your cart changed. Reload it before checking out.");
      if (!cart.items.length) throw failure(400, "Your cart is empty.");
      for (const item of cart.items) {
        const reserved = await this.store.run(
          "UPDATE commerce_products SET stock=stock-? WHERE app_id=? AND id=? AND stock>=?",
          item.quantity,
          app.id,
          item.id,
          item.quantity,
        );
        if (!reserved.changes)
          throw failure(409, `${item.name} is out of stock. Update your cart.`);
      }
      const orderId = randomUUID();
      // Only server prices and quantities contribute to the immutable order snapshot.
      await this.store.run(
        "INSERT INTO commerce_orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        orderId,
        app.id,
        user.id,
        cart.totalCents,
        this.currency,
        "pending",
        mode,
        key,
        fingerprint,
        address,
        JSON.stringify(cart.items),
        null,
        new Date().toISOString(),
      );
      await this.store.run(
        "DELETE FROM commerce_cart WHERE app_id=? AND user_id=?",
        app.id,
        user.id,
      );
      await this.bump(app, user);
      return await this.order(app, user, orderId);
    });
  }
  paymentReturn() {
    if (!this.options.stripeKey || !this.options.stripeWebhookSecret)
      throw failure(
        503,
        "Payments need STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_RETURN_URL on the server.",
      );
    let uri;
    try {
      uri = new URL(this.options.stripeReturnUrl);
    } catch {
      throw failure(
        503,
        "Configure an HTTPS STRIPE_RETURN_URL before enabling payments.",
      );
    }
    if (uri.protocol !== "https:" || uri.username || uri.password || uri.hash)
      throw failure(503, "STRIPE_RETURN_URL must be an HTTPS app link.");
    return uri;
  }
  async stripe(path, fields, key) {
    const response = await this.fetch(`https://api.stripe.com/v1/${path}`, {
      method: fields ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${this.options.stripeKey}`,
        ...(fields
          ? {
              "Content-Type": "application/x-www-form-urlencoded",
              "Idempotency-Key": key,
            }
          : {}),
      },
      ...(fields ? { body: new URLSearchParams(fields) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw failure(
        502,
        "Payment provider is unavailable. Retry this order from Order details.",
      );
    return result;
  }
  async checkout(app, user, body) {
    const row = body.orderId
      ? await this.order(app, user, body.orderId)
      : await this.createOrder(app, user, body);
    if (row.status !== "pending") return { order: this.publicOrder(row) };
    if (row.mode === "demo")
      return { order: this.publicOrder(row), demo: true };
    if (row.mode === "razorpay") return this.razorpay.checkout(app, user, row);
    const returnUrl = this.paymentReturn();
    returnUrl.searchParams.set("orderId", row.id);
    const fields = {
      mode: "payment",
      expires_at: String(Math.floor(Date.parse(row.created) / 1000) + 1800),
      success_url: returnUrl.toString(),
      cancel_url: returnUrl.toString(),
      client_reference_id: row.id,
      "metadata[orderId]": row.id,
      "metadata[appId]": app.id,
    };
    JSON.parse(row.items).forEach((item, index) =>
      Object.assign(fields, {
        [`line_items[${index}][price_data][currency]`]: row.currency,
        [`line_items[${index}][price_data][unit_amount]`]: String(item.price),
        [`line_items[${index}][price_data][product_data][name]`]: item.name,
        [`line_items[${index}][quantity]`]: String(item.quantity),
      }),
    );
    const session = row.session_id
      ? await this.stripe(
          `checkout/sessions/${encodeURIComponent(row.session_id)}`,
        )
      : await this.stripe(
          "checkout/sessions",
          fields,
          `spacewidget:${app.id}:${row.id}`,
        );
    if (
      session.metadata?.orderId !== row.id ||
      session.metadata?.appId !== app.id
    )
      throw failure(502, "Payment session does not match this order.");
    await this.store.run(
      "UPDATE commerce_orders SET session_id=? WHERE id=? AND app_id=?",
      session.id,
      row.id,
      app.id,
    );
    if (session.payment_status === "paid")
      await this.confirm(app.id, row.id, session);
    if (session.status === "expired") await this.release(row);
    return {
      order: this.publicOrder(await this.order(app, user, row.id)),
      checkoutUrl: session.url,
      canOpen:
        typeof session.url === "string" &&
        session.url.length > 0 &&
        session.status === "open",
      sessionId: session.id,
    };
  }
  async confirm(appId, orderId, session) {
    return await this.store.transaction(async () => {
      const row = await this.store.one(
        "SELECT * FROM commerce_orders WHERE app_id=? AND id=?",
        appId,
        orderId,
      );
      if (
        !row ||
        session.metadata?.appId !== appId ||
        session.metadata?.orderId !== row.id ||
        session.amount_total !== row.total ||
        session.currency !== row.currency ||
        session.payment_status !== "paid" ||
        (row.session_id && session.id !== row.session_id)
      )
        throw failure(400, "Payment confirmation did not match the order.");
      if (row.status === "paid") return;
      if (row.status !== "pending")
        throw failure(
          409,
          "Order is no longer awaiting payment. Reconcile this payment with support.",
        );
      await this.store.run(
        "UPDATE commerce_orders SET status='paid',session_id=COALESCE(session_id,?) WHERE id=?",
        row.mode === "demo" ? null : session.id,
        row.id,
      );
      await this.store.run(
        "INSERT INTO commerce_notifications VALUES(?,?,?,?,?,?,?,?,0)",
        randomUUID(),
        appId,
        row.user_id,
        "Order confirmed",
        `Your order for ${money(row.total, row.currency)} is confirmed.`,
        "order",
        row.id,
        new Date().toISOString(),
      );
    });
  }
  async verify(app, user, orderId) {
    let row = await this.order(app, user, orderId);
    if (row.status === "pending" && row.mode === "razorpay") {
      await this.razorpay.verify(row);
      row = await this.order(app, user, orderId);
    }
    if (row.status === "pending" && row.mode === "stripe" && row.session_id) {
      const session = await this.stripe(
        `checkout/sessions/${encodeURIComponent(row.session_id)}`,
      );
      if (session.payment_status === "paid")
        await this.confirm(app.id, row.id, session);
      if (session.status === "expired") await this.release(row);
      row = await this.order(app, user, orderId);
    }
    return { order: this.publicOrder(row) };
  }
  async release(row) {
    await this.store.transaction(async () => {
      if (
        !(
          await this.store.run(
            "UPDATE commerce_orders SET status='cancelled' WHERE id=? AND status='pending'",
            row.id,
          )
        ).changes
      )
        return;
      for (const item of JSON.parse(row.items))
        await this.store.run(
          "UPDATE commerce_products SET stock=stock+? WHERE app_id=? AND id=?",
          item.quantity,
          row.app_id,
          item.id,
        );
    });
  }
  async cancel(app, user, orderId) {
    let row = await this.order(app, user, orderId);
    if (row.status === "paid")
      throw failure(
        409,
        "Paid orders require a refund workflow. Contact support.",
      );
    if (row.status === "pending" && row.mode === "razorpay")
      await this.razorpay.cancel(row);
    if (row.status === "pending" && row.mode === "stripe") {
      // Recover ambiguous checkout creation before releasing any reservation.
      if (!row.session_id) {
        await this.checkout(app, user, { orderId });
        row = await this.order(app, user, orderId);
      }
      const session = await this.stripe(
        `checkout/sessions/${encodeURIComponent(row.session_id)}`,
      );
      if (session.payment_status === "paid") {
        await this.confirm(app.id, row.id, session);
        throw failure(
          409,
          "Payment has completed. This order cannot be cancelled.",
        );
      }
      if (session.status !== "expired")
        await this.stripe(
          `checkout/sessions/${encodeURIComponent(row.session_id)}/expire`,
          {},
          `cancel:${row.id}`,
        );
    }
    await this.release(row);
    return { order: this.publicOrder(await this.order(app, user, orderId)) };
  }
  async demoConfirm(app, user, orderId) {
    const row = await this.order(app, user, orderId);
    if (
      row.mode !== "demo" ||
      this.options.production ||
      !this.options.demoPayments
    )
      throw failure(403, "Demo payment is disabled.");
    await this.confirm(app.id, row.id, {
      metadata: { appId: app.id, orderId: row.id },
      amount_total: row.total,
      currency: row.currency,
      payment_status: "paid",
    });
    return { order: this.publicOrder(await this.order(app, user, orderId)) };
  }
  async screen(loader, app, user, query) {
    if (loader === "catalog") return await this.catalog(app, query);
    if (loader === "cart") return await this.cart(app, user);
    if (loader === "order")
      return {
        order: this.publicOrder(await this.order(app, user, query.orderId)),
        demoPayments:
          this.options.demoPayments === true && !this.options.production,
      };
    if (loader === "orders") {
      this.requireUser(user);
      return {
        orders: (
          await this.store.all(
            "SELECT * FROM commerce_orders WHERE app_id=? AND user_id=? ORDER BY created DESC LIMIT 100",
            app.id,
            user.id,
          )
        ).map((r) => this.publicOrder(r)),
      };
    }
    if (loader === "notifications") {
      this.requireUser(user);
      return {
        notifications: await this.store.all(
          "SELECT id,title,body,screen_id,order_id,created,read FROM commerce_notifications WHERE app_id=? AND user_id=? ORDER BY created DESC LIMIT 100",
          app.id,
          user.id,
        ),
      };
    }
    return {};
  }
  verifyWebhook(bytes, signature) {
    if (!this.options.stripeWebhookSecret)
      throw failure(503, "Stripe webhook secret is not configured.");
    const parts = String(signature || "")
        .split(",")
        .map((v) => v.split("=")),
      timestamp = parts.find(([k]) => k === "t")?.[1];
    if (
      !/^\d+$/.test(timestamp || "") ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    )
      throw failure(400, "Invalid webhook timestamp.");
    const expected = createHmac("sha256", this.options.stripeWebhookSecret)
      .update(`${timestamp}.`)
      .update(bytes)
      .digest();
    if (
      !parts.some(
        ([k, v]) =>
          k === "v1" &&
          /^[a-f0-9]{64}$/.test(v || "") &&
          timingSafeEqual(expected, Buffer.from(v, "hex")),
      )
    )
      throw failure(400, "Invalid webhook signature.");
    return JSON.parse(bytes.toString());
  }
}

export function commerceRoutes(runtime, { commerce, auth, published }) {
  const context = async (request) => {
    const { doc } = await published(request);
    if (!doc.features?.includes("commerce"))
      throw failure(404, "Commerce is not enabled for this app.");
    return [
      request.app,
      await auth.current(request.app, request.headers.authorization),
    ];
  };
  const route = (method, path, handler) =>
    runtime.route({
      method,
      url: `/commerce/${path}`,
      handler: async (request) => ({
        success: true,
        data: await handler(
          ...(await context(request)),
          request.body || {},
          request,
        ),
      }),
    });
  route(
    "GET",
    "products",
    async (app, user, body, request) =>
      await commerce.catalog(app, request.query),
  );
  route("GET", "cart", async (app, user) => await commerce.cart(app, user));
  route(
    "POST",
    "cart",
    async (app, user, body) => await commerce.setCart(app, user, body),
  );
  route(
    "POST",
    "checkout",
    async (app, user, body) => await commerce.checkout(app, user, body),
  );
  route(
    "POST",
    "verify",
    async (app, user, body) => await commerce.verify(app, user, body.orderId),
  );
  route(
    "POST",
    "cancel",
    async (app, user, body) => await commerce.cancel(app, user, body.orderId),
  );
  route(
    "POST",
    "demo-confirm",
    async (app, user, body) =>
      await commerce.demoConfirm(app, user, body.orderId),
  );
  route(
    "GET",
    "notifications",
    async (app, user) => await commerce.screen("notifications", app, user, {}),
  );
  route("POST", "notifications/read", async (app, user, body) => {
    commerce.requireUser(user);
    await commerce.store.run(
      "UPDATE commerce_notifications SET read=1 WHERE app_id=? AND user_id=? AND id=?",
      app.id,
      user.id,
      String(body.id),
    );
    return {};
  });
}
