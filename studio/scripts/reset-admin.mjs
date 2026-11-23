import { existsSync } from "node:fs";
import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { openStore } from "../server/store.mjs";
import { passwordHash, email } from "../server/security.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
let hidden = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!hidden) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: process.stdin.isTTY,
});
try {
  const address = email(await rl.question("Builder email: "));
  process.stdout.write("New password (at least 10 characters): ");
  hidden = true;
  const password = await rl.question("");
  hidden = false;
  process.stdout.write("\n");
  const encoded = await passwordHash(password),
    store = await openStore(
      process.env.STUDIO_DATABASE_URL || process.env.DATABASE_URL,
    );
  try {
    const account = await store.one(
      "SELECT id FROM admins WHERE email=?",
      address,
    );
    if (!account) throw new Error("Builder account not found.");
    await store.transaction(async () => {
      await store.run(
        "UPDATE admins SET password=? WHERE id=?",
        encoded,
        account.id,
      );
      await store.run(
        "DELETE FROM admin_sessions WHERE admin_id=?",
        account.id,
      );
    });
    console.log("Password updated. Existing Studio sessions were revoked.");
  } finally {
    await store.close();
  }
} finally {
  rl.close();
}
