import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
if (existsSync(".env")) process.loadEnvFile(".env");
const config = JSON.parse(
  readFileSync(
    resolve(process.env.STUDIO_DATA_DIR || "data", "commerce-demo.json"),
  ),
);
const cwd = fileURLToPath(new URL("../../example", import.meta.url));
const args = [
  "build",
  "web",
  "--release",
  "--no-wasm-dry-run",
  "--target=lib/main_commerce.dart",
  "--base-href=/commerce-demo/",
  "--output=build/commerce-web",
  `--dart-define=SPACE_STUDIO_URL=${config.baseUrl}`,
  `--dart-define=SPACE_STUDIO_KEY=${config.apiKey}`,
];
const authReturn =
  process.env.SPACE_AUTH_RETURN_URL ||
  String(process.env.SPACE_AUTH_RETURN_URLS || "")
    .split(",")
    .filter(Boolean)[0];
const paymentReturn =
  process.env.SPACE_PAYMENT_RETURN_URL ||
  (process.env.PAYMENT_PROVIDER === "razorpay"
    ? process.env.RAZORPAY_RETURN_URL
    : process.env.STRIPE_RETURN_URL);
if (authReturn) args.push(`--dart-define=SPACE_AUTH_RETURN_URL=${authReturn}`);
if (paymentReturn)
  args.push(`--dart-define=SPACE_PAYMENT_RETURN_URL=${paymentReturn}`);
for (const step of [["pub", "get"], args]) {
  const result = spawnSync(process.env.FLUTTER_BIN || "flutter", step, {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status) {
    process.exitCode = result.status;
    break;
  }
}
