import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import pg from "pg";
let starting;
export async function testDatabaseUrl() {
  if (process.env.STUDIO_TEST_POSTGRES_URL)
    return process.env.STUDIO_TEST_POSTGRES_URL;
  return (starting ||= (async () => {
    const bin = process.env.PG_BIN || "/usr/lib/postgresql/16/bin";
    if (!existsSync(join(bin, "initdb")) || process.getuid?.() === 0)
      throw new Error(
        "Tests require PostgreSQL: set STUDIO_TEST_POSTGRES_URL to a dedicated test database.",
      );
    const directory = mkdtempSync(join(tmpdir(), "spacewidget-pg-tests-")),
      socket = net.createServer();
    await new Promise((r) => socket.listen(0, "127.0.0.1", r));
    const port = socket.address().port;
    await new Promise((r) => socket.close(r));
    execFileSync(
      join(bin, "initdb"),
      ["-D", directory, "-A", "trust", "-U", "studio", "--no-locale"],
      { stdio: "ignore" },
    );
    execFileSync(
      join(bin, "pg_ctl"),
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
    process.once("exit", () => {
      try {
        execFileSync(
          join(bin, "pg_ctl"),
          ["-D", directory, "-m", "immediate", "-w", "stop"],
          { stdio: "ignore" },
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
    return `postgresql://studio@127.0.0.1:${port}/postgres`;
  })());
}
export async function testStoreOptions() {
  return {
    databaseUrl: await testDatabaseUrl(),
    schema: `sw_test_${randomBytes(10).toString("hex")}`,
    databaseTls: false,
  };
}
export async function dropTestStore(options) {
  if (!/^sw_test_[a-f0-9]{20}$/.test(options.schema))
    throw new Error("Refusing to drop a non-test schema.");
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${options.schema}" CASCADE`);
  } finally {
    await client.end();
  }
}
