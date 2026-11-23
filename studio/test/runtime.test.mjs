import { testStoreOptions, dropTestStore } from "./database.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { id, passwordHash } from "../server/security.mjs";
import { fixture, setupToken } from "./helpers.mjs";
import { createServer } from "../server/app.mjs";
test("setup, admin isolation, CSRF, encrypted connections and publish validation", async (t) => {
  const f = await fixture(t),
    { call, admin, server, app } = f;
  assert.equal(
    (await call("POST", "/api/setup", {}, { "x-setup-token": setupToken }))
      .status,
    409,
  );
  assert.equal((await call("GET", "/api/apps")).status, 401);
  assert.equal(
    (await call("POST", "/api/apps", { name: "bad" }, { cookie: admin.cookie }))
      .status,
    403,
  );
  await server.store.run(
    "INSERT INTO admins(id,email,password) VALUES(?,?,?)",
    id(),
    "other@example.com",
    await passwordHash("another-password"),
  );
  const login = await call("POST", "/api/login", {
      email: "other@example.com",
      password: "another-password",
    }),
    outside = {
      cookie: `sw_studio=${login.response.cookies[0].value}`,
      "x-csrf-token": login.data.csrf,
    };
  assert.equal(
    (await call("GET", `/api/apps/${app.id}`, undefined, outside)).status,
    404,
  );
  assert.equal(
    (await call("POST", `/api/apps/${app.id}/keys`, {}, outside)).status,
    404,
  );
  assert.notEqual(
    (
      await server.store.one(
        "SELECT config FROM connections WHERE app_id=?",
        app.id,
      )
    ).config,
    "{}",
  );
  const bad = structuredClone(app.draft);
  bad.screens[0].queries[0].select = ["password"];
  assert.equal((await f.save(bad)).status, 200);
  assert.equal((await f.publish()).status, 400);
  assert.equal(
    (await call("GET", "/runtime/start", undefined, f.runtime)).status,
    404,
  );
});
test("complete screen responses, component expansion, draft isolation, version rollback and optimistic saves", async (t) => {
  const f = await fixture(t),
    { call, runtime, app, admin } = f,
    published = await f.publish();
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const first = await call("GET", "/runtime/start", undefined, runtime);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.state.products.length, 3);
  assert.ok(!JSON.stringify(first.data.widgets).includes("componentId"));
  const edited = structuredClone(app.draft);
  edited.components[0].defaults.title = "Second version";
  assert.equal((await f.save(edited)).status, 200);
  assert.ok(
    !JSON.stringify(
      (await call("GET", "/runtime/start", undefined, runtime)).data,
    ).includes("Second version"),
  );
  assert.equal((await f.publish()).data.version, 2);
  assert.ok(
    JSON.stringify(
      (await call("GET", "/runtime/start", undefined, runtime)).data,
    ).includes("Second version"),
  );
  await call("POST", `/api/apps/${app.id}/releases/1/activate`, {}, admin);
  assert.equal(
    (await call("GET", "/runtime/start", undefined, runtime)).data.version,
    1,
  );
  assert.equal(
    (
      await call(
        "PUT",
        `/api/apps/${app.id}/draft`,
        { revision: 1, document: edited },
        admin,
      )
    ).status,
    409,
  );
});
test("cycles and unsupported native widgets fail validation", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft);
  doc.components[0].tree = {
    type: "component",
    componentId: doc.components[0].id,
  };
  assert.equal((await f.save(doc)).status, 400);
  doc.components = [];
  doc.screens[0].tree = { type: "notInstalled" };
  assert.equal((await f.save(doc)).status, 400);
});
test("verified users own their records; spoofed IDs cannot change another account; logout revokes tokens", async (t) => {
  const f = await fixture(t),
    { call, runtime } = f;
  assert.equal((await f.publish()).status, 200);
  assert.equal(
    (await call("GET", "/runtime/screens/profile", undefined, runtime)).status,
    401,
  );
  const register = async (name) =>
    (
      await call(
        "POST",
        "/runtime/auth/register",
        {
          name,
          email: `${name}@example.com`,
          password: "correct-user-password",
        },
        runtime,
      )
    ).data.data;
  const alice = await register("Alice"),
    bob = await register("Bob");
  assert.ok(alice?.accessToken);
  const ah = { ...runtime, authorization: `Bearer ${alice.accessToken}` },
    bh = { ...runtime, authorization: `Bearer ${bob.accessToken}` };
  assert.equal(
    (
      await call(
        "GET",
        `/runtime/screens/profile?user_id=${bob.user.id}`,
        undefined,
        ah,
      )
    ).data.state.user.name,
    "Alice",
  );
  const write = await call(
    "POST",
    "/runtime/actions/save-profile",
    { name: "Alice Updated", user_id: bob.user.id, id: bob.user.id },
    ah,
  );
  assert.equal(write.status, 200, JSON.stringify(write.data));
  assert.equal(
    (await call("GET", "/runtime/screens/profile", undefined, bh)).data.state
      .user.name,
    "Bob",
  );
  assert.equal(
    (await call("GET", "/runtime/screens/profile", undefined, ah)).data.state
      .user.name,
    "Alice Updated",
  );
  const refreshed = await call(
    "POST",
    "/runtime/auth/refresh",
    { refreshToken: alice.refreshToken },
    runtime,
  );
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.data.data.refreshToken, alice.refreshToken);
  const renewed = {
    ...runtime,
    authorization: `Bearer ${refreshed.data.data.accessToken}`,
  };
  await call(
    "POST",
    "/runtime/auth/logout",
    { refreshToken: refreshed.data.data.refreshToken },
    renewed,
  );
  assert.equal(
    (await call("GET", "/runtime/auth/me", undefined, renewed)).status,
    401,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/runtime/auth/refresh",
        { refreshToken: refreshed.data.data.refreshToken },
        runtime,
      )
    ).status,
    401,
  );
  const other = (
      await call("POST", "/api/apps", { name: "Another app" }, f.admin)
    ).data,
    otherKey = (await call("POST", `/api/apps/${other.id}/keys`, {}, f.admin))
      .data.key;
  assert.equal(
    (
      await call("GET", "/runtime/auth/me", undefined, {
        "x-space-api-key": otherKey,
        authorization: `Bearer ${bob.accessToken}`,
      })
    ).status,
    401,
  );
});
test("refresh replay revokes family; password reset and email verification codes are one-use", async (t) => {
  const f = await fixture(t),
    { call, runtime, admin, app } = f;
  const session = (
    await call(
      "POST",
      "/runtime/auth/register",
      { name: "A", email: "a@example.com", password: "original-password" },
      runtime,
    )
  ).data.data;
  const next = (
    await call(
      "POST",
      "/runtime/auth/refresh",
      { refreshToken: session.refreshToken },
      runtime,
    )
  ).data.data;
  assert.equal(
    (
      await call(
        "POST",
        "/runtime/auth/refresh",
        { refreshToken: session.refreshToken },
        runtime,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call("GET", "/runtime/auth/me", undefined, {
        ...runtime,
        authorization: `Bearer ${next.accessToken}`,
      })
    ).status,
    401,
  );
  const unknown = await call(
      "POST",
      "/runtime/auth/password/request",
      { email: "missing@example.com" },
      runtime,
    ),
    known = await call(
      "POST",
      "/runtime/auth/password/request",
      { email: "a@example.com" },
      runtime,
    );
  assert.deepEqual(unknown.data, known.data);
  const code = (
    await call("GET", `/api/apps/${app.id}/outbox`, undefined, admin)
  ).data[0].code;
  assert.equal(
    (
      await call(
        "POST",
        "/runtime/auth/password/reset",
        {
          email: "a@example.com",
          code: "000000",
          password: "changed-password",
        },
        runtime,
      )
    ).status,
    400,
  );
  const reset = await call(
    "POST",
    "/runtime/auth/password/reset",
    { email: "a@example.com", code, password: "changed-password" },
    runtime,
  );
  assert.equal(reset.status, 200, JSON.stringify(reset.data));
  assert.equal(
    (
      await call(
        "POST",
        "/runtime/auth/password/reset",
        { email: "a@example.com", code, password: "changed-again" },
        runtime,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/runtime/auth/login",
        { email: "a@example.com", password: "original-password" },
        runtime,
      )
    ).status,
    401,
  );
  const user = {
    ...runtime,
    authorization: `Bearer ${reset.data.data.accessToken}`,
  };
  await call("POST", "/runtime/auth/otp/request", {}, user);
  const verify = (
    await call("GET", `/api/apps/${app.id}/outbox`, undefined, admin)
  ).data[0].code;
  assert.equal(
    (
      await call(
        "POST",
        "/runtime/auth/otp/verify",
        { email: "a@example.com", code: verify },
        runtime,
      )
    ).data.data.user.emailVerified,
    true,
  );
});
test("parameterized search, query-scoped signed cursors, and runtime key rotation/revocation", async (t) => {
  const f = await fixture(t),
    { call, runtime, app, admin } = f,
    doc = structuredClone(app.draft);
  doc.screens[0].queries[0].limit = 1;
  await f.save(doc);
  await f.publish();
  const page = (
    await call("GET", "/runtime/data/main/products", undefined, runtime)
  ).data.data;
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  const second = (
    await call(
      "GET",
      `/runtime/data/main/products?cursor=${encodeURIComponent(page.nextCursor)}`,
      undefined,
      runtime,
    )
  ).data.data;
  assert.notEqual(second.items[0].id, page.items[0].id);
  assert.equal(
    (
      await call(
        "GET",
        `/runtime/data/main/products?q=lamp&cursor=${encodeURIComponent(page.nextCursor)}`,
        undefined,
        runtime,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "GET",
        "/runtime/data/main/products?q=" + encodeURIComponent("' OR 1=1 --"),
        undefined,
        runtime,
      )
    ).data.data.items.length,
    0,
  );
  const rotated = (
    await call("POST", `/api/apps/${app.id}/keys/${f.key.id}/rotate`, {}, admin)
  ).data;
  assert.equal(
    (await call("GET", "/runtime/start", undefined, runtime)).status,
    401,
  );
  assert.equal(
    (
      await call("GET", "/runtime/start", undefined, {
        "x-space-api-key": rotated.key,
      })
    ).status,
    200,
  );
  assert.ok(
    !JSON.stringify(
      (await call("GET", `/api/apps/${app.id}/keys`, undefined, admin)).data,
    ).includes(rotated.key),
  );
  await call(
    "POST",
    `/api/apps/${app.id}/keys/${rotated.id}/revoke`,
    {},
    admin,
  );
  assert.equal(
    (
      await call("GET", "/runtime/start", undefined, {
        "x-space-api-key": rotated.key,
      })
    ).status,
    401,
  );
});

test("owner invitations create isolated builder accounts and cannot be reused", async (t) => {
  const f = await fixture(t),
    { call, admin, app } = f;
  const invite = await call(
    "POST",
    "/api/invites",
    { email: "invited@example.com" },
    admin,
  );
  assert.equal(invite.status, 200);
  const value = new URL(invite.data.url).searchParams.get("invite");
  assert.equal(
    (
      await call("POST", "/api/register", {
        email: "wrong@example.com",
        password: "invited-password",
        invite: value,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("POST", "/api/register", {
        email: "invited@example.com",
        password: "invited-password",
        invite: value,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("POST", "/api/register", {
        email: "invited@example.com",
        password: "invited-password",
        invite: value,
      })
    ).status,
    403,
  );
  const login = await call("POST", "/api/login", {
    email: "invited@example.com",
    password: "invited-password",
  });
  assert.equal(login.data.isOwner, false);
  const headers = {
    cookie: `sw_studio=${login.response.cookies[0].value}`,
    "x-csrf-token": login.data.csrf,
  };
  assert.deepEqual(
    (await call("GET", "/api/apps", undefined, headers)).data,
    [],
  );
  assert.equal(
    (await call("GET", `/api/apps/${app.id}`, undefined, headers)).status,
    404,
  );
  assert.equal(
    (
      await call(
        "POST",
        "/api/invites",
        { email: "third@example.com" },
        headers,
      )
    ).status,
    403,
  );
});

test("component instances namespace form IDs and references while retaining submitted record IDs", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft);
  doc.components.push({
    id: "editor",
    name: "Editor",
    defaults: {},
    tree: {
      type: "form",
      id: "editor-form",
      children: [
        {
          type: "button",
          text: "Save",
          action: {
            type: "submit",
            form: "editor-form",
            source: "/runtime/actions/save-profile",
            data: { id: "record-id", form: "business-value" },
          },
        },
      ],
    },
  });
  doc.screens[0].tree = {
    type: "column",
    children: [
      { type: "component", id: "first", componentId: "editor" },
      { type: "component", id: "second", componentId: "editor" },
    ],
  };
  assert.equal((await f.save(doc)).status, 200);
  assert.equal((await f.publish()).status, 200);
  const tree = (await f.call("GET", "/runtime/start", undefined, f.runtime))
    .data.widgets;
  assert.equal(tree.children[0].id, "first:editor-form");
  assert.equal(tree.children[1].id, "second:editor-form");
  assert.equal(tree.children[0].children[0].action.form, "first:editor-form");
  assert.deepEqual(tree.children[0].children[0].action.data, {
    id: "record-id",
    form: "business-value",
  });
});

test("identical screen sources share one result and public screens cannot contain private source declarations", async (t) => {
  const f = await fixture(t),
    doc = structuredClone(f.app.draft);
  doc.screens[0].queries.push({
    ...doc.screens[0].queries[0],
    id: "same_products",
  });
  assert.equal((await f.save(doc)).status, 200);
  assert.equal((await f.publish()).status, 200);
  const read = f.server.dataService.read.bind(f.server.dataService);
  let reads = 0;
  f.server.dataService.read = async (...args) => {
    reads++;
    return read(...args);
  };
  const response = await f.call("GET", "/runtime/start", undefined, f.runtime);
  assert.equal(response.status, 200);
  assert.equal(reads, 1);
  assert.deepEqual(
    response.data.state.products,
    response.data.state.same_products,
  );
  doc.screens[0].queries[0].scope = "user";
  assert.equal((await f.save(doc)).status, 400);
});

test("login limits distinguish clients only through an explicitly trusted proxy", async (t) => {
  for (const trustProxy of [false, "loopback"]) {
    const server = await createServer({
      ...(await testStoreOptions()),
      masterKey: "8".repeat(64),
      setupToken,
      trustProxy,
    });
    t.after(() => server.close());
    const login = (ip) =>
      server.inject({
        method: "POST",
        url: "/api/login",
        headers: { "x-forwarded-for": ip },
        payload: { email: "missing@example.com", password: "invalid-password" },
      });
    for (let i = 0; i < 10; i++)
      assert.equal((await login("192.0.2.1")).statusCode, 401);
    assert.equal((await login("192.0.2.1")).statusCode, 429);
    assert.equal((await login("192.0.2.2")).statusCode, trustProxy ? 401 : 429);
  }
});

test("runtime preflights allow app keys, JSON and bearer headers without authenticating OPTIONS", async (t) => {
  const f = await fixture(t);
  for (const [path, method, headers] of [
    ["/runtime/start", "GET", "x-space-api-key"],
    ["/runtime/auth/register", "POST", "content-type,x-space-api-key"],
    ["/runtime/screens/profile", "GET", "authorization,x-space-api-key"],
  ]) {
    const response = await f.server.inject({
      method: "OPTIONS",
      url: path,
      headers: {
        origin: "http://localhost:53123",
        "access-control-request-method": method,
        "access-control-request-headers": headers,
      },
    });
    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "*");
    const allowed = response.headers["access-control-allow-headers"]
      .toLowerCase()
      .split(/,\s*/);
    for (const header of headers.split(","))
      assert.ok(allowed.includes(header));
    assert.ok(
      response.headers["access-control-allow-methods"].includes(method),
    );
  }
  const denied = await f.server.inject({
    url: "/runtime/start",
    headers: { origin: "http://localhost:53123", "x-space-api-key": "invalid" },
  });
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.headers["access-control-allow-origin"], "*");
  assert.equal(denied.json().code, "APP_KEY_INVALID");
});

test("runtime custom API preflights include all configured mutation methods", async (t) => {
  const { server } = await fixture(t);
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const result = await server.inject({
      method: "OPTIONS",
      url: "/runtime/http/service/endpoint",
      headers: {
        origin: "https://app.example.com",
        "access-control-request-method": method,
        "access-control-request-headers":
          "x-space-api-key,authorization,content-type",
      },
    });
    assert.equal(result.statusCode, 204);
    assert.ok(result.headers["access-control-allow-methods"].includes(method));
  }
});
