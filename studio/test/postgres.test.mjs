import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import net from "node:net";
import pg from "pg";
import { fixture } from "./helpers.mjs";

const pgBin = process.env.PG_BIN || "/usr/lib/postgresql/16/bin";
test(
  "real PostgreSQL connector introspects fields and enforces ownership on form writes and reads",
  {
    skip:
      !process.env.STUDIO_TEST_POSTGRES_URL &&
      (!existsSync(join(pgBin, "initdb")) || process.getuid?.() === 0),
  },
  async (t) => {
    const f = await fixture(t);
    let url = process.env.STUDIO_TEST_POSTGRES_URL;
    if (!url) {
      const directory = await mkdtemp(join(tmpdir(), "spacewidget-pg-"));
      const socket = net.createServer();
      await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
      const port = socket.address().port;
      await new Promise((resolve) => socket.close(resolve));
      execFileSync(
        join(pgBin, "initdb"),
        ["-D", directory, "-A", "trust", "-U", "studio", "--no-locale"],
        { stdio: "ignore" },
      );
      execFileSync(
        join(pgBin, "pg_ctl"),
        [
          "-D",
          directory,
          "-o",
          `-F -h 127.0.0.1 -k ${directory} -p ${port}`,
          "-l",
          join(directory, "server.log"),
          "-w",
          "start",
        ],
        { stdio: "ignore" },
      );
      t.after(async () => {
        execFileSync(
          join(pgBin, "pg_ctl"),
          ["-D", directory, "-m", "immediate", "-w", "stop"],
          { stdio: "ignore" },
        );
        await rm(directory, { recursive: true, force: true });
      });
      url = `postgresql://studio@127.0.0.1:${port}/postgres`;
    }
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    let clientClosed = false;
    const table = `sw_test_${Date.now()}`;
    await client.query(
      `CREATE TABLE public."${table}"(id uuid PRIMARY KEY,user_id uuid NOT NULL,name text,quantity integer)`,
    );
    t.after(async () => {
      if (clientClosed) return;
      try {
        await client.query(`DROP TABLE IF EXISTS public."${table}"`);
      } finally {
        await client.end();
      }
    });
    f.server.dataService.environmentDatabase = {
      url: `${url}?sslmode=disable`,
      tls: false,
    };
    const envConnection = await f.call(
      "POST",
      `/api/apps/${f.app.id}/connections`,
      { kind: "postgres", name: "Environment DB", env: "APP_DATABASE_URL" },
      f.admin,
    );
    assert.equal(envConnection.status, 200, JSON.stringify(envConnection.data));
    assert.ok(!JSON.stringify(envConnection.data).includes(url));
    const sealed = await f.server.store.one(
      "SELECT config FROM connections WHERE id=?",
      envConnection.data.id,
    );
    const reference = f.server.dataService.vault.open(sealed.config);
    assert.deepEqual(reference, { env: "APP_DATABASE_URL" });
    const { call, app, admin, runtime } = f;
    const connection = await call(
      "POST",
      `/api/apps/${app.id}/connections`,
      { kind: "postgres", name: "Integration DB", url, tls: false },
      admin,
    );
    assert.equal(connection.status, 200, JSON.stringify(connection.data));
    assert.ok(!JSON.stringify(connection.data).includes(url));
    const cid = connection.data.id,
      columns = await call(
        "GET",
        `/api/apps/${app.id}/connections/${cid}/tables/${table}`,
        undefined,
        admin,
      );
    assert.deepEqual(
      columns.data.map((x) => x.name),
      ["id", "user_id", "name", "quantity"],
    );
    const doc = structuredClone(app.draft);
    doc.screens[1].queries = [
      {
        id: "user",
        connectionId: cid,
        table,
        select: ["id", "name", "quantity"],
        scope: "user",
        ownerColumn: "user_id",
        filters: [],
        orderBy: "id",
        direction: "asc",
        limit: 10,
        single: false,
      },
    ];
    doc.actions = [
      {
        id: "create-note",
        connectionId: cid,
        table,
        operation: "insert",
        ownerColumn: "user_id",
        fields: {
          name: {
            column: "name",
            type: "string",
            required: true,
            maxLength: 100,
          },
          quantity: {
            column: "quantity",
            type: "integer",
            required: true,
            maxLength: 100,
          },
        },
        filters: [],
      },
    ];
    assert.equal((await f.save(doc)).status, 200);
    assert.equal((await f.publish()).status, 200);
    const register = async (name) =>
      (
        await call(
          "POST",
          "/runtime/auth/register",
          {
            name,
            email: `${name}@example.com`,
            password: "postgres-test-password",
          },
          runtime,
        )
      ).data.data;
    const a = await register("Alice"),
      b = await register("Bob"),
      ah = { ...runtime, authorization: `Bearer ${a.accessToken}` },
      bh = { ...runtime, authorization: `Bearer ${b.accessToken}` };
    const create = await call(
      "POST",
      "/runtime/actions/create-note",
      { name: "Private note", quantity: "2", user_id: b.user.id },
      ah,
    );
    assert.equal(create.status, 200, JSON.stringify(create.data));
    assert.equal(create.data.data.items[0].user_id, a.user.id);
    assert.equal(create.data.data.items[0].quantity, 2);
    assert.equal(
      (await call("GET", "/runtime/screens/profile", undefined, ah)).data.state
        .user.length,
      1,
    );
    assert.equal(
      (await call("GET", "/runtime/screens/profile", undefined, bh)).data.state
        .user.length,
      0,
    );
    const encrypted = (
      await f.server.store.one("SELECT config FROM connections WHERE id=?", cid)
    ).config;
    assert.ok(!encrypted.includes(url));
    // Close the test SQL client before its private PostgreSQL cluster shuts down.
    await client.query(`DROP TABLE public."${table}"`);
    await client.end();
    clientClosed = true;
  },
);
