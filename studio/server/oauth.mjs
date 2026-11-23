import { randomBytes, randomUUID } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import { failure, hash, passwordHash, validEmail, email } from "./security.mjs";
const opaque = () => randomBytes(32).toString("base64url");
export class GoogleOAuth {
  constructor(store, vault, auth, data, options = {}) {
    Object.assign(this, { store, vault, auth, data, options });
    this.fetch = options.fetch || fetch;
    this.provider = options.provider || "google";
    this.jwks = createRemoteJWKSet(
      new URL(
        this.provider === "apple"
          ? "https://appleid.apple.com/auth/keys"
          : "https://www.googleapis.com/oauth2/v3/certs",
      ),
    );
  }
  async start(app, body) {
    if (
      !this.options.clientId ||
      !(this.provider === "apple"
        ? this.options.privateKey && this.options.teamId && this.options.keyId
        : this.options.clientSecret) ||
      !this.options.callbackUrl
    )
      throw failure(
        503,
        `${this.provider} sign-in is not configured on this server.`,
      );
    const returnUri = String(body.returnUri || ""),
      challenge = String(body.codeChallenge || "");
    if (
      !this.options.returnUrls?.includes(returnUri) ||
      !/^[A-Za-z0-9_-]{43}$/.test(challenge)
    )
      throw failure(
        400,
        "Choose an approved app return URL and an S256 code challenge.",
      );
    const state = opaque(),
      nonce = opaque(),
      verifier = opaque();
    await this.store.run(
      "DELETE FROM oauth_attempts WHERE expires<?",
      Date.now(),
    );
    await this.store.run(
      "INSERT INTO oauth_attempts VALUES(?,?,?,?,NULL,NULL)",
      hash(state),
      app.id,
      this.vault.seal({
        returnUri,
        challenge,
        nonce,
        verifier,
        provider: this.provider,
      }),
      Date.now() + 5 * 60000,
    );
    const uri = new URL(
      this.provider === "apple"
        ? "https://appleid.apple.com/auth/authorize"
        : "https://accounts.google.com/o/oauth2/v2/auth",
    );
    uri.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.callbackUrl,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: hash(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    // hash() is hex for database identifiers; PKCE is specifically SHA-256 base64url.
    uri.searchParams.set("code_challenge", pkce(verifier));
    if (this.provider === "apple") {
      uri.searchParams.set("scope", "name email");
      uri.searchParams.set("response_mode", "form_post");
      for (const key of ["code_challenge", "code_challenge_method", "prompt"])
        uri.searchParams.delete(key);
    }
    return { authorizationUrl: uri.toString() };
  }
  async callback(query) {
    const attempt = await this.store.one(
      "SELECT * FROM oauth_attempts WHERE state_hash=? AND expires>? AND handoff_hash IS NULL",
      hash(String(query.state || "")),
      Date.now(),
    );
    if (!attempt)
      throw failure(400, "Sign-in attempt expired or was already used.");
    const config = this.vault.open(attempt.config);
    if ((config.provider || "google") !== this.provider)
      throw failure(400, "OAuth provider does not match this attempt.");
    const claim = await this.store.run(
      "UPDATE oauth_attempts SET handoff_hash=state_hash WHERE state_hash=? AND handoff_hash IS NULL",
      attempt.state_hash,
    );
    if (!claim.changes) throw failure(400, "Sign-in attempt was already used.");
    const target = new URL(config.returnUri);
    if (query.error) {
      await this.store.run(
        "DELETE FROM oauth_attempts WHERE state_hash=?",
        attempt.state_hash,
      );
      target.searchParams.set("oauthError", "cancelled");
      return target;
    }
    if (typeof query.code !== "string" || query.code.length > 3000)
      throw failure(400, "Missing authorization code.");
    const response = await this.fetch(
      this.provider === "apple"
        ? "https://appleid.apple.com/auth/token"
        : "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: this.options.clientId,
          client_secret:
            this.provider === "apple"
              ? await this.appleSecret()
              : this.options.clientSecret,
          redirect_uri: this.options.callbackUrl,
          grant_type: "authorization_code",
          ...(this.provider === "apple"
            ? {}
            : { code_verifier: config.verifier }),
        }),
      },
    );
    if (!response.ok)
      throw failure(
        401,
        `${this.provider} sign-in could not be completed. Start again.`,
      );
    const tokens = await response.json();
    let claims;
    try {
      if (typeof tokens.id_token !== "string" || tokens.id_token.length > 20000)
        throw new Error("Invalid ID token");
      claims = this.options.verifyToken
        ? await this.options.verifyToken(tokens.id_token)
        : (
            await jwtVerify(tokens.id_token, this.jwks, {
              algorithms: ["RS256"],
              issuer:
                this.provider === "apple"
                  ? "https://appleid.apple.com"
                  : ["https://accounts.google.com", "accounts.google.com"],
              audience: this.options.clientId,
            })
          ).payload;
    } catch {
      throw failure(
        401,
        "The provider identity token could not be verified. Start again.",
      );
    }
    if (
      !claims ||
      claims.nonce !== config.nonce ||
      !claims.sub ||
      typeof claims.sub !== "string" ||
      ![true, "true"].includes(claims.email_verified)
    )
      throw failure(401, "The provider did not verify this sign-in.");
    const address = validEmail(email(claims.email));
    const identity = await this.store.one(
      "SELECT user_id FROM oauth_identities WHERE app_id=? AND provider=? AND subject=?",
      attempt.app_id,
      this.provider,
      claims.sub,
    );
    let user =
      identity &&
      (await this.store.one(
        "SELECT * FROM runtime_users WHERE id=? AND app_id=?",
        identity.user_id,
        attempt.app_id,
      ));
    if (!user) {
      if (
        await this.store.one(
          "SELECT id FROM runtime_users WHERE app_id=? AND email=?",
          attempt.app_id,
          address,
        )
      )
        throw failure(
          409,
          "This email already has an account. Sign in with its existing method; account linking requires an authenticated account.",
        );
      const userId = randomUUID(),
        password = await passwordHash(opaque()),
        name = String(claims.name || address.split("@")[0]).slice(0, 120);
      await this.store.transaction(async () => {
        await this.store.run(
          "INSERT INTO runtime_users VALUES(?,?,?,?,?,1)",
          userId,
          attempt.app_id,
          address,
          password,
          name,
        );
        await this.store.run(
          "INSERT INTO oauth_identities VALUES(?,?,?,?)",
          attempt.app_id,
          this.provider,
          claims.sub,
          userId,
        );
        for (const connection of await this.store.all(
          "SELECT * FROM connections WHERE app_id=? AND kind='managed'",
          attempt.app_id,
        ))
          await this.store.run(
            `INSERT INTO ${this.data.managedName(connection, "profiles")}(id,user_id,name,email,avatar_url) VALUES(?,?,?,?,?)`,
            userId,
            userId,
            name,
            address,
            "",
          );
      });
      user = await this.store.one(
        "SELECT * FROM runtime_users WHERE id=?",
        userId,
      );
    }
    const handoff = opaque();
    // Credentials never travel in redirect URLs. Exchange this short-lived code with PKCE.
    await this.store.run(
      "UPDATE oauth_attempts SET handoff_hash=?,handoff=? WHERE state_hash=?",
      hash(handoff),
      this.vault.seal({ userId: user.id }),
      attempt.state_hash,
    );
    target.searchParams.set("oauthCode", handoff);
    return target;
  }
  async appleSecret() {
    const key = await importPKCS8(
      this.options.privateKey.replace(/\\n/g, "\n"),
      "ES256",
    );
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.options.keyId })
      .setIssuer(this.options.teamId)
      .setSubject(this.options.clientId)
      .setAudience("https://appleid.apple.com")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
  }
  async exchange(app, body) {
    const attempt = await this.store.one(
      "SELECT * FROM oauth_attempts WHERE app_id=? AND handoff_hash=? AND expires>?",
      app.id,
      hash(String(body.code || "")),
      Date.now(),
    );
    if (
      !attempt ||
      !/^[A-Za-z0-9._~-]{43,128}$/.test(String(body.codeVerifier || ""))
    )
      throw failure(401, "Sign-in code is invalid or expired.");
    const config = this.vault.open(attempt.config);
    if (
      (config.provider || "google") !== this.provider ||
      pkce(body.codeVerifier) !== config.challenge
    )
      throw failure(401, "Sign-in code verifier does not match.");
    const { userId } = this.vault.open(attempt.handoff),
      user = await this.store.one(
        "SELECT * FROM runtime_users WHERE id=? AND app_id=?",
        userId,
        app.id,
      );
    if (
      !user ||
      !(
        await this.store.run(
          "DELETE FROM oauth_attempts WHERE state_hash=?",
          attempt.state_hash,
        )
      ).changes
    )
      throw failure(401, "Sign-in code was already used.");
    return await this.auth.session(app, user);
  }
}
import { createHash } from "node:crypto";
export const pkce = (value) =>
  createHash("sha256").update(value).digest("base64url");
