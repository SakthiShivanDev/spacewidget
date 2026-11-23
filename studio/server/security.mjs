import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  scrypt as rawScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(rawScrypt);
export const id = () => randomBytes(12).toString("hex");
export const token = (prefix = "") =>
  prefix + randomBytes(32).toString("base64url");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function equal(a, b) {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function passwordHash(value) {
  if (typeof value !== "string" || value.length < 10 || value.length > 200)
    throw failure(400, "Use a password between 10 and 200 characters.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${Buffer.from(await scrypt(value, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(value, saved) {
  const [salt, expected] = (saved || "0000000000000000:00").split(":");
  if (typeof value !== "string" || value.length > 200) return false;
  return equal(
    Buffer.from(await scrypt(value, salt, 64)).toString("hex"),
    expected,
  );
}
export function encryption(master) {
  if (!/^[a-f0-9]{64}$/i.test(master || ""))
    throw new Error(
      "STUDIO_MASTER_KEY must be 32 bytes of hex. Run npm run configure.",
    );
  const key = Buffer.from(master, "hex");
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      const bytes = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), bytes]
        .map((b) => b.toString("base64url"))
        .join(".");
    },
    open(value) {
      const [iv, tag, bytes] = value
        .split(".")
        .map((b) => Buffer.from(b, "base64url"));
      const cipher = createDecipheriv("aes-256-gcm", key, iv);
      cipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([cipher.update(bytes), cipher.final()]).toString(),
      );
    },
    key,
  };
}
export function failure(statusCode, message, publicCode) {
  return Object.assign(new Error(message), { statusCode, publicCode });
}
export const email = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
export function validEmail(value) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)
    throw failure(400, "A valid email is required.");
  return value;
}
export function identifier(value) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/i.test(value))
    throw failure(400, "Invalid table or column identifier.");
  return `"${value}"`;
}
