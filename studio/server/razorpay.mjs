import { createHmac, timingSafeEqual } from "node:crypto";
import { failure } from "./security.mjs";
const validSignature = (secret, message, signature) => {
  if (!secret || !/^[a-f0-9]{64}$/i.test(String(signature || ""))) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
};
export class RazorpayPayments {
  constructor(commerce) {
    this.commerce = commerce;
    this.options = commerce.options;
  }
  configured() {
    return !!(
      this.options.razorpayKeyId &&
      this.options.razorpayKeySecret &&
      this.options.razorpayWebhookSecret &&
      this.options.razorpayReturnUrl
    );
  }
  returnUrl() {
    if (!this.configured())
      throw failure(
        503,
        "Configure RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET and RAZORPAY_RETURN_URL.",
      );
    let url;
    try {
      url = new URL(this.options.razorpayReturnUrl);
    } catch {
      throw failure(503, "Configure an HTTPS Razorpay return URL.");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw failure(503, "Razorpay return URL must be an HTTPS app link.");
    return url;
  }
  async call(path, body) {
    const response = await this.commerce.fetch(
      `https://api.razorpay.com/v1/${path}`,
      {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.options.razorpayKeyId}:${this.options.razorpayKeySecret}`).toString("base64")}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok)
      throw failure(
        502,
        "Razorpay is unavailable. Retry this existing order; do not create a new checkout.",
      );
    return response.json();
  }
  validate(row, link) {
    if (
      link.reference_id !== row.id ||
      link.notes?.appId !== row.app_id ||
      link.notes?.orderId !== row.id ||
      link.amount !== row.total ||
      String(link.currency).toLowerCase() !== row.currency ||
      (row.session_id && link.id !== row.session_id)
    )
      throw failure(400, "Razorpay link does not match the order.");
  }
  async apply(row, link) {
    this.validate(row, link);
    if (link.status === "paid" && link.amount_paid === row.total)
      await this.commerce.confirm(row.app_id, row.id, {
        id: link.id,
        metadata: { appId: row.app_id, orderId: row.id },
        amount_total: link.amount,
        currency: String(link.currency).toLowerCase(),
        payment_status: "paid",
      });
    if (["expired", "cancelled"].includes(link.status))
      await this.commerce.release(row);
  }
  async link(row, create = false) {
    this.returnUrl();
    if (row.session_id)
      return this.call(`payment_links/${encodeURIComponent(row.session_id)}`);
    // reference_id is unique at Razorpay, so retries and concurrent calls recover
    // the existing link even if the first create response was lost.
    const existing = await this.call(
      `payment_links?reference_id=${encodeURIComponent(row.id)}`,
    );
    let link = existing.payment_links?.find((l) => l.reference_id === row.id);
    if (!link && create) {
      const url = this.returnUrl();
      url.searchParams.set("orderId", row.id);
      try {
        link = await this.call("payment_links", {
          amount: row.total,
          currency: row.currency.toUpperCase(),
          reference_id: row.id,
          description: `Order ${row.id}`,
          accept_partial: false,
          notify: { sms: false, email: false },
          reminder_enable: false,
          expire_by: Math.floor(Date.parse(row.created) / 1000) + 1800,
          callback_url: url.toString(),
          callback_method: "get",
          notes: { appId: row.app_id, orderId: row.id },
        });
      } catch (error) {
        const retry = await this.call(
          `payment_links?reference_id=${encodeURIComponent(row.id)}`,
        );
        link = retry.payment_links?.find((l) => l.reference_id === row.id);
        if (!link) throw error;
      }
    }
    if (!link)
      throw failure(
        409,
        "Payment creation is unresolved. Retry checkout before cancelling this reservation.",
      );
    this.validate(row, link);
    await this.commerce.store.run(
      "UPDATE commerce_orders SET session_id=? WHERE id=? AND app_id=? AND (session_id IS NULL OR session_id=?)",
      link.id,
      row.id,
      row.app_id,
      link.id,
    );
    return link;
  }
  async checkout(app, user, row) {
    const link = await this.link(row, true);
    await this.apply(row, link);
    const url =
      typeof link.short_url === "string" ? new URL(link.short_url) : null;
    if (url && (url.protocol !== "https:" || url.username || url.password))
      throw failure(502, "Invalid Razorpay checkout URL.");
    return {
      order: this.commerce.publicOrder(
        await this.commerce.order(app, user, row.id),
      ),
      checkoutUrl: url?.toString(),
      canOpen: !!url && link.status === "created",
      sessionId: link.id,
    };
  }
  async verify(row) {
    const link = await this.link(row);
    await this.apply(row, link);
  }
  async cancel(row) {
    const link = await this.link(row, true);
    this.validate(row, link);
    if (link.status === "paid") {
      await this.apply(row, link);
      throw failure(409, "Payment completed. This order cannot be cancelled.");
    }
    if (!["expired", "cancelled"].includes(link.status)) {
      const cancelled = await this.call(
        `payment_links/${encodeURIComponent(link.id)}/cancel`,
        {},
      );
      this.validate(row, cancelled);
      if (cancelled.status !== "cancelled")
        throw failure(
          409,
          "Payment cancellation is not confirmed. Retry verification.",
        );
    }
  }
  webhook(bytes, signature) {
    if (!this.options.razorpayWebhookSecret)
      throw failure(503, "Razorpay webhook is not configured.");
    if (!validSignature(this.options.razorpayWebhookSecret, bytes, signature))
      throw failure(400, "Invalid Razorpay webhook signature.");
    try {
      return JSON.parse(bytes.toString());
    } catch {
      throw failure(400, "Invalid Razorpay webhook JSON.");
    }
  }
}
