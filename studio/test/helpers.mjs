import assert from "node:assert/strict";
import { testStoreOptions, dropTestStore } from "./database.mjs";
import { createServer } from "../server/app.mjs";
export const setupToken = "test-setup-token-with-enough-entropy";
export async function fixture(t, options = {}) {
  const database = await testStoreOptions();
  const server = await createServer({
    ...database,
    masterKey: "7".repeat(64),
    setupToken,
    rateLimit: false,
    ...options,
  });
  t.after(async () => {
    await server.close();
    await dropTestStore(database);
  });
  const call = async (method, url, body, headers = {}) => {
    const r = await server.inject({
      method,
      url,
      headers,
      ...(body === undefined ? {} : { payload: body }),
    });
    return { status: r.statusCode, data: r.json(), response: r };
  };
  const setup = await call(
    "POST",
    "/api/setup",
    { email: "owner@example.com", password: "correct-horse-battery" },
    { "x-setup-token": setupToken },
  );
  assert.equal(setup.status, 201, JSON.stringify(setup.data));
  const login = await call("POST", "/api/login", {
    email: "owner@example.com",
    password: "correct-horse-battery",
  });
  const admin = {
    cookie: `sw_studio=${login.response.cookies[0].value}`,
    "x-csrf-token": login.data.csrf,
  };
  const app = (
    await call(
      "POST",
      "/api/apps",
      {
        name: "Everyday",
        ...(options.template ? { template: options.template } : {}),
      },
      admin,
    )
  ).data;
  assert.ok(app.id, JSON.stringify(app));
  const key = (await call("POST", `/api/apps/${app.id}/keys`, {}, admin)).data,
    runtime = { "x-space-api-key": key.key };
  const publish = async () =>
    await call(
      "POST",
      `/api/apps/${app.id}/releases`,
      { revision: app.revision },
      admin,
    );
  const save = async (doc) => {
    const r = await call(
      "PUT",
      `/api/apps/${app.id}/draft`,
      { revision: app.revision, document: doc },
      admin,
    );
    if (r.status === 200) Object.assign(app, r.data);
    return r;
  };
  return { server, call, admin, app, key, runtime, publish, save };
}
