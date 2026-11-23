import { SignJWT, importPKCS8 } from "jose";
import { failure, hash } from "./security.mjs";
export class PushService {
  constructor(store, vault, options = {}) {
    Object.assign(this, { store, vault, options });
    this.fetch = options.fetch || fetch;
    this.sending = false;
  }
  async register(app, user, body) {
    if (!user) throw failure(401, "Sign in to enable notifications.");
    const token = String(body.token || "");
    if (token.length < 20 || token.length > 4096 || /\s/.test(token))
      throw failure(400, "Invalid push registration token.");
    const tokenHash = hash(token);
    await this.store.transaction(async () => {
      await this.store.run(
        "INSERT INTO push_devices VALUES(?,?,?,?,?,?) ON CONFLICT(app_id,token_hash) DO UPDATE SET user_id=excluded.user_id,token=excluded.token,platform=excluded.platform,updated=excluded.updated",
        app.id,
        user.id,
        tokenHash,
        this.vault.seal({ token }),
        String(body.platform || "unknown").slice(0, 20),
        Date.now(),
      );
      await this.store.run(
        "INSERT INTO push_sessions VALUES(?,?,?) ON CONFLICT(app_id,token_hash) DO UPDATE SET session_id=excluded.session_id",
        app.id,
        tokenHash,
        user.sessionId,
      );
    });
  }
  async remove(app, user, token) {
    if (!user) throw failure(401, "Sign in.");
    await this.store.run(
      "DELETE FROM push_sessions WHERE app_id=? AND token_hash=? AND token_hash IN (SELECT token_hash FROM push_devices WHERE app_id=? AND user_id=?)",
      app.id,
      hash(String(token)),
      app.id,
      user.id,
    );
    await this.store.run(
      "DELETE FROM push_devices WHERE app_id=? AND user_id=? AND token_hash=?",
      app.id,
      user.id,
      hash(String(token)),
    );
  }
  async revokeSession(app, sessionId) {
    await this.store.run(
      "DELETE FROM push_devices WHERE app_id=? AND token_hash IN (SELECT token_hash FROM push_sessions WHERE app_id=? AND session_id=?)",
      app.id,
      app.id,
      sessionId,
    );
    await this.store.run(
      "DELETE FROM push_sessions WHERE app_id=? AND session_id=?",
      app.id,
      sessionId,
    );
  }
  async notification(app, user, notificationId) {
    if (!user) throw failure(401, "Sign in.");
    const row = await this.store.one(
      "SELECT * FROM notifications WHERE app_id=? AND user_id=? AND id=?",
      app.id,
      user.id,
      notificationId,
    );
    if (!row) throw failure(404, "Notification not found.");
    // Recheck ownership at navigation time; payloads contain only an opaque ID.
    const destinationOverride = row.order_id
      ? await this.options.resolveLegacyDestination?.(app, user, row)
      : null;
    if (row.order_id && !destinationOverride)
      throw failure(404, "Notification destination is no longer available.");
    await this.store.run("UPDATE notifications SET read=1 WHERE id=?", row.id);
    if (destinationOverride) return destinationOverride;
    const release = await this.store.one(
      "SELECT r.document FROM releases r JOIN apps a ON a.id=r.app_id AND a.published=r.version WHERE a.id=?",
      app.id,
    );
    if (
      !release ||
      !JSON.parse(release.document).screens.some((s) => s.id === row.screen_id)
    )
      throw failure(404, "Notification screen is no longer available.");
    const destination = await this.store.one(
      "SELECT query FROM notification_destinations WHERE notification_id=?",
      row.id,
    );
    return {
      screenId: row.screen_id,
      query: destination ? JSON.parse(destination.query) : {},
    };
  }
  async accessToken() {
    if (this.access && this.access.expires > Date.now() + 60000)
      return this.access.token;
    const account = this.options.account;
    if (!account?.client_email || !account?.private_key || !account?.project_id)
      throw failure(503, "Firebase push is not configured.");
    const key = await importPKCS8(account.private_key, "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(account.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);
    const response = await this.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) throw failure(502, "Firebase authorization failed.");
    const data = await response.json();
    if (typeof data.access_token !== "string")
      throw failure(502, "Invalid Firebase authorization response.");
    this.access = {
      token: data.access_token,
      expires:
        Date.now() + Math.min(Number(data.expires_in) || 3600, 3600) * 1000,
    };
    return this.access.token;
  }
  async flush() {
    if (this.sending || !this.options.account) return;
    this.sending = true;
    try {
      const rows = await this.store.all(
        "SELECT n.*,COALESCE(d.attempts,0) AS attempts FROM notifications n LEFT JOIN push_delivery d ON n.id=d.notification_id WHERE COALESCE(d.completed,0)=0 AND COALESCE(d.next_attempt,0)<=? AND n.created>? ORDER BY n.created LIMIT 25",
        Date.now(),
        new Date(Date.now() - 86400000).toISOString(),
      );
      for (const notification of rows) {
        let failed = false;
        const devices = await this.store.all(
          "SELECT p.* FROM push_devices p JOIN push_sessions s ON s.app_id=p.app_id AND s.token_hash=p.token_hash JOIN runtime_sessions r ON r.id=s.session_id WHERE p.app_id=? AND p.user_id=? AND r.expires>?",
          notification.app_id,
          notification.user_id,
          Date.now(),
        );
        for (const device of devices) {
          try {
            const response = await this.fetch(
              `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.options.account.project_id)}/messages:send`,
              {
                method: "POST",
                redirect: "error",
                signal: AbortSignal.timeout(15000),
                headers: {
                  Authorization: `Bearer ${await this.accessToken()}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token: this.vault.open(device.token).token,
                    notification: {
                      title: notification.title,
                      body: notification.body,
                    },
                    data: { notificationId: notification.id },
                  },
                }),
              },
            );
            if (!response.ok) {
              const body = await response.json();
              if (
                body.error?.details?.some((d) => d.errorCode === "UNREGISTERED")
              )
                await this.store.run(
                  "DELETE FROM push_devices WHERE app_id=? AND token_hash=?",
                  device.app_id,
                  device.token_hash,
                );
              else failed = true;
            }
          } catch {
            failed = true;
          }
        }
        const attempts = notification.attempts + 1;
        await this.store.run(
          "INSERT INTO push_delivery VALUES(?,?,?,?) ON CONFLICT(notification_id) DO UPDATE SET attempts=excluded.attempts,next_attempt=excluded.next_attempt,completed=excluded.completed",
          notification.id,
          attempts,
          Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7)),
          failed ? 0 : 1,
        );
      }
    } finally {
      this.sending = false;
    }
  }
}
export function pushRoutes(runtime, { push, auth }) {
  const user = async (request) =>
    await auth.current(request.app, request.headers.authorization);
  runtime.post("/push/devices", async (request) => {
    await push.register(request.app, await user(request), request.body || {});
    return { success: true };
  });
  runtime.post("/push/devices/remove", async (request) => {
    await push.remove(request.app, await user(request), request.body?.token);
    return { success: true };
  });
  runtime.get("/push/notifications", async (request) => {
    const current = await user(request);
    if (!current) throw failure(401, "Sign in to read notifications.");
    const items = await push.store.all(
      "SELECT id,title,body,screen_id,created,read FROM notifications WHERE app_id=? AND user_id=? ORDER BY created DESC,id DESC LIMIT 100",
      request.app.id,
      current.id,
    );
    return { success: true, data: { items } };
  });
  runtime.get("/push/notifications/:id", async (request) => ({
    success: true,
    data: await push.notification(
      request.app,
      await user(request),
      request.params.id,
    ),
  }));
}
