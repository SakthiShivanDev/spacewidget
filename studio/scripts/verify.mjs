import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const flutter = process.env.FLUTTER_BIN || "flutter";
function run(command, args, directory = ".") {
  const result = spawnSync(command, args, {
    cwd: new URL(directory + "/", `file://${root}`),
    stdio: "inherit",
    env: { ...process.env, STUDIO_NODE_BIN: process.execPath },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(
  process.execPath,
  [
    "node_modules/eslint/bin/eslint.js",
    "web",
    "shared",
    "server",
    "scripts",
    "templates",
  ],
  "studio",
);
for (const directory of [
  ".",
  "packages/spacewidget_adapters",
  "packages/spacewidget_firebase",
]) {
  run(flutter, ["pub", "get"], directory);
  run(flutter, ["analyze"], directory);
  run(flutter, ["test"], directory);
}
run(flutter, ["pub", "get"], "studio/preview");
run(flutter, ["analyze"], "studio/preview");
run(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    ...readdirSync(new URL("../test/", import.meta.url))
      .filter((name) => name.endsWith(".test.mjs"))
      .map((name) => `test/${name}`),
  ],
  "studio",
);
run(process.execPath, ["scripts/build-preview.mjs"], "studio");
run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], "studio");
run(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test"],
  "studio",
);
run(process.execPath, ["scripts/test-web-client.mjs"], "studio");
