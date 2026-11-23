import { SignJWT, jwtVerify } from "jose";
import { randomUUID, randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import {
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

export class RuntimeAuth {
  constructor(store, vault, data, options = {}) {
    this.store = store;
    this.vault = vault;
    this.data = data;
    this.options = options;
    this.mail = options.smtpUrl
      ? nodemailer.createTransport(options.smtpUrl)
      : null;
  }
  user(row) {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      emailVerified: !!row.verified,
    };
  }
  async access(session, user) {
    return new SignJWT({ sid: session.id, email: user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("spacewidget-studio")
      .setAudience(session.app_id)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(this.vault.key);
  }
  async session(app, user) {
    const sid = id(),
      refresh = token(`${sid}.`),
      expires = Date.now() + 30 * 86400000;
    await this.store.run(
      "INSERT INTO runtime_sessions VALUES(?,?,?,?,?)",
      sid,
      app.id,
      user.id,
      hash(refresh),
      expires,
    );
    return {
      accessToken: await this.access({ id: sid, app_id: app.id }, user),
      refreshToken: refresh,
      expiresAt: Date.now() + 15 * 60000,
      user: this.user(user),
    };
  }
  async current(app, authorization) {
    if (!authorization) return null;
    if (!authorization.startsWith("Bearer "))
      throw failure(401, "Invalid authorization header.");
    try {
      const { payload } = await jwtVerify(
        authorization.slice(7),
        this.vault.key,
        {
          algorithms: ["HS256"],
          issuer: "spacewidget-studio",
          audience: app.id,
        },
      );
      const session = await this.store.one(
        "SELECT * FROM runtime_sessions WHERE id=? AND app_id=? AND user_id=? AND expires>?",
        payload.sid,
        app.id,
        payload.sub,
        Date.now(),
      );
      if (!session) throw new Error("revoked");
      const user = await this.store.one(
        "SELECT * FROM runtime_users WHERE id=? AND app_id=?",
        payload.sub,
        app.id,
      );
      if (!user) throw new Error("missing");
      return { ...this.user(user), sessionId: session.id };
    } catch {
      throw failure(401, "Session expired or invalid.");
    }
  }
  async register(app, body) {
    const address = validEmail(email(body.email)),
      name = String(body.name || "").trim();
    if (!name || name.length > 120)
      throw failure(400, "Name is required (up to 120 characters).");
    const password = await passwordHash(body.password);
    const user = {
      id: randomUUID(),
      app_id: app.id,
      email: address,
      name,
      password,
      verified: 0,
    };
    if (
      await this.store.one(
        "SELECT id FROM runtime_users WHERE app_id=? AND email=?",
        app.id,
        address,
      )
    )
      throw failure(409, "Unable to create this account. Try signing in.");
    await this.store.transaction(async () => {
      await this.store.run(
        "INSERT INTO runtime_users VALUES(?,?,?,?,?,?)",
        user.id,
        app.id,
        address,
        password,
        name,
        0,
      );
      for (const connection of await this.store.all(
        "SELECT * FROM connections WHERE app_id=? AND kind='managed'",
        app.id,
      )) {
        await this.store.run(
          `INSERT INTO ${this.data.managedName(connection, "profiles")}(id,user_id,name,email,avatar_url) VALUES(?,?,?,?,?)`,
          user.id,
          user.id,
          name,
          address,
          "",
        );
      }
    });
    return await this.session(app, user);
  }
  async login(app, body) {
    const user = await this.store.one(
      "SELECT * FROM runtime_users WHERE app_id=? AND email=?",
      app.id,
      email(body.email),
    );
    if (!(await verifyPassword(body.password, user?.password)))
      throw failure(401, "Email or password is incorrect.");
    return await this.session(app, user);
  }
  async refresh(app, refreshToken) {
    if (typeof refreshToken !== "string" || refreshToken.length > 300)
      throw failure(401, "Invalid refresh token.");
    const digest = hash(refreshToken),
      sid = refreshToken.split(".")[0];
    const old = await this.store.one(
      "SELECT * FROM spent_refresh WHERE hash=? AND expires>?",
      digest,
      Date.now(),
    );
    if (old) {
      await this.store.run(
        "DELETE FROM runtime_sessions WHERE id=? AND app_id=?",
        old.session_id,
        app.id,
      );
      throw failure(401, "Refresh token was reused. Sign in again.");
    }
    const session = await this.store.one(
      "SELECT * FROM runtime_sessions WHERE id=? AND app_id=? AND refresh=? AND expires>?",
      sid,
      app.id,
      digest,
      Date.now(),
    );
    if (!session) throw failure(401, "Session expired or invalid.");
    const next = token(`${sid}.`);
    await this.store.transaction(async () => {
      await this.store.run(
        "INSERT INTO spent_refresh VALUES(?,?,?)",
        digest,
        sid,
        session.expires,
      );
      await this.store.run(
        "UPDATE runtime_sessions SET refresh=? WHERE id=? AND refresh=?",
        hash(next),
        sid,
        digest,
      );
    });
    const user = await this.store.one(
      "SELECT * FROM runtime_users WHERE id=?",
      session.user_id,
    );
    return {
      accessToken: await this.access(session, user),
      refreshToken: next,
      expiresAt: Date.now() + 15 * 60000,
      user: this.user(user),
    };
  }
  async logout(app, body, user) {
    if (user)
      await this.store.run(
        "DELETE FROM runtime_sessions WHERE id=? AND app_id=?",
        user.sessionId,
        app.id,
      );
    if (typeof body.refreshToken === "string")
      await this.store.run(
        "DELETE FROM runtime_sessions WHERE refresh=? AND app_id=?",
        hash(body.refreshToken),
        app.id,
      );
  }
  async challenge(app, body, purpose, user) {
    if (!this.mail && this.options.production)
      throw failure(503, "Email delivery is not configured.");
    const target =
      purpose === "verify"
        ? await this.store.one(
            "SELECT * FROM runtime_users WHERE id=? AND app_id=?",
            user?.id || "",
            app.id,
          )
        : await this.store.one(
            "SELECT * FROM runtime_users WHERE email=? AND app_id=?",
            email(body.email),
            app.id,
          );
    // Identical response for registered and unknown reset addresses.
    if (!target) return;
    await this.store.run(
      "DELETE FROM challenges WHERE app_id=? AND user_id=? AND purpose=?",
      app.id,
      target.id,
      purpose,
    );
    const code = String(randomInt(100000, 1000000));
    const challenge = id();
    await this.store.run(
      "INSERT INTO challenges VALUES(?,?,?,?,?,?,0)",
      challenge,
      app.id,
      target.id,
      purpose,
      hash(`${app.id}:${target.id}:${code}`),
      Date.now() + 10 * 60000,
    );
    const content = {
      to: target.email,
      subject:
        purpose === "verify" ? "Verify your email" : "Reset your password",
      text: `Your SpaceWidget code is ${code}. It expires in 10 minutes.`,
      code,
      purpose,
    };
    try {
      if (this.mail)
        await this.mail.sendMail({
          from: this.options.mailFrom,
          ...content,
          code: undefined,
          purpose: undefined,
        });
      else
        await this.store.run(
          "INSERT INTO outbox VALUES(?,?,?,?)",
          id(),
          app.id,
          this.vault.seal(content),
          new Date().toISOString(),
        );
    } catch {
      await this.store.run("DELETE FROM challenges WHERE id=?", challenge);
      throw failure(503, "Unable to deliver email. Try again later.");
    }
  }
  async verifyCode(app, body, purpose) {
    const target = await this.store.one(
      "SELECT * FROM runtime_users WHERE email=? AND app_id=?",
      email(body.email),
      app.id,
    );
    const challenge =
      target &&
      (await this.store.one(
        "SELECT * FROM challenges WHERE app_id=? AND user_id=? AND purpose=?",
        app.id,
        target.id,
        purpose,
      ));
    if (
      !challenge ||
      challenge.expires < Date.now() ||
      challenge.attempts >= 5 ||
      typeof body.code !== "string"
    )
      throw failure(400, "Code is invalid or expired.");
    await this.store.run(
      "UPDATE challenges SET attempts=attempts+1 WHERE id=?",
      challenge.id,
    );
    if (!equal(challenge.code, hash(`${app.id}:${target.id}:${body.code}`)))
      throw failure(400, "Code is invalid or expired.");
    const password =
      purpose === "reset" ? await passwordHash(body.password) : null;
    await this.store.transaction(async () => {
      // A challenge is consumed exactly once, even across concurrent requests.
      const removed = await this.store.run(
        "DELETE FROM challenges WHERE id=? AND attempts<=5",
        challenge.id,
      );
      if (!removed.changes) throw failure(400, "Code is invalid or expired.");
      if (purpose === "reset") {
        await this.store.run(
          "UPDATE runtime_users SET password=? WHERE id=?",
          password,
          target.id,
        );
        await this.store.run(
          "DELETE FROM runtime_sessions WHERE user_id=? AND app_id=?",
          target.id,
          app.id,
        );
      } else
        await this.store.run(
          "UPDATE runtime_users SET verified=1 WHERE id=?",
          target.id,
        );
    });
    return await this.session(app, {
      ...target,
      verified: purpose === "verify" ? 1 : target.verified,
    });
  }
}
