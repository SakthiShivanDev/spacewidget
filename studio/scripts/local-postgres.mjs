import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";
if (existsSync(".env")) process.loadEnvFile(".env");
if (process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL)
  throw new Error(
    "A PostgreSQL URL is already configured. Keep it; this helper creates a separate local development database only.",
  );
const directory = resolve("data/postgres"),
  bin = process.env.PG_BIN || "/usr/lib/postgresql/16/bin",
  port = Number(process.env.STUDIO_LOCAL_PG_PORT || 54329),
  password = randomBytes(32).toString("base64url");
if (existsSync(join(directory, "PG_VERSION")))
  throw new Error(
    "A local cluster already exists. Start it with pg_ctl using data/postgres; keep the original environment credentials.",
  );
mkdirSync(directory, { recursive: true, mode: 0o700 });
const pwfile = resolve("data/.postgres-bootstrap-password");
writeFileSync(pwfile, password, { mode: 0o600 });
try {
  execFileSync(
    join(bin, "initdb"),
    [
      "-D",
      directory,
      "-U",
      "spacewidget",
      "-A",
      "scram-sha-256",
      "--pwfile",
      pwfile,
      "--no-locale",
    ],
    { stdio: "ignore" },
  );
} finally {
  unlinkSync(pwfile);
}
execFileSync(
  join(bin, "pg_ctl"),
  [
    "-D",
    directory,
    "-o",
    `-h 127.0.0.1 -k ${directory} -p ${port}`,
    "-l",
    join(directory, "server.log"),
    "-w",
    "start",
  ],
  { stdio: "ignore" },
);
const url = `postgresql://spacewidget:${encodeURIComponent(password)}@127.0.0.1:${port}/spacewidget`;
const admin = new pg.Client({
  connectionString: url.replace(/\/spacewidget$/, "/postgres"),
});
await admin.connect();
try {
  await admin.query("CREATE DATABASE spacewidget");
} finally {
  await admin.end();
}
const contents = existsSync(".env") ? readFileSync(".env", "utf8") : "";
writeFileSync(
  ".env",
  `${contents.trimEnd()}\nSTUDIO_DATABASE_URL=${url}\nSTUDIO_DATABASE_TLS=false\nSTUDIO_DATABASE_SCHEMA=spacewidget\n`,
  { mode: 0o600 },
);
console.log(
  "Created a private local PostgreSQL cluster on port " +
    port +
    ". Its URL is in .env. Existing SQLite data has not been changed. Run the one-time import before restarting Studio.",
);
