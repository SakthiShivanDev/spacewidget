import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env"))
  throw new Error(".env already exists; preserve the existing encryption key.");
writeFileSync(
  ".env",
  `STUDIO_MASTER_KEY=${randomBytes(32).toString("hex")}\nSTUDIO_SETUP_TOKEN=${randomBytes(24).toString("base64url")}\nSTUDIO_ORIGIN=http://localhost:4100\nHOST=127.0.0.1\nPORT=4100\n`,
  { mode: 0o600 },
);
console.log(
  "Created private .env. Use its STUDIO_SETUP_TOKEN on the first-run setup screen. Keep this file for decryption and backups.",
);
