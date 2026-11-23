import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const studio = fileURLToPath(new URL("..", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "spacewidget-web-client-"));
const fixture = spawn(process.execPath, ["test/live-fixture.mjs"], {
  cwd: studio,
  stdio: ["ignore", "pipe", "inherit"],
});
const lines = createInterface({ input: fixture.stdout });
try {
  const config = await Promise.race([
    new Promise((resolve, reject) => {
      lines.once("line", (value) => {
        try {
          resolve(JSON.parse(value));
        } catch (error) {
          reject(error);
        }
      });
      fixture.once("error", reject);
      fixture.once("exit", (code) =>
        reject(new Error(`API fixture exited early (${code}).`)),
      );
    }),
    new Promise((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error("API fixture startup timed out.")),
        15000,
      );
      timer.unref();
    }),
  ]);
  const defines = join(directory, "defines.json");
  await writeFile(
    defines,
    JSON.stringify({
      SPACE_TEST_STUDIO_URL: config.baseUrl,
      SPACE_TEST_STUDIO_KEY: config.apiKey,
    }),
    { mode: 0o600 },
  );
  const executable = join(directory, "chrome");
  // Chrome runs under a container-compatible launcher only for this test.
  await writeFile(
    executable,
    '#!/bin/sh\nexec "${CHROME_BIN:-/usr/bin/google-chrome}" --no-sandbox "$@"\n',
    { mode: 0o700 },
  );
  const test = spawn(
    process.env.FLUTTER_BIN || "flutter",
    [
      "test",
      "--no-pub",
      "--platform=chrome",
      `--dart-define-from-file=${defines}`,
      "test/web/hosted_client_browser.dart",
    ],
    {
      cwd: fileURLToPath(
        new URL("../../packages/spacewidget_adapters", import.meta.url),
      ),
      env: { ...process.env, CHROME_EXECUTABLE: executable },
      stdio: "inherit",
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    test.once("exit", (code) => resolve(code ?? 1));
    test.once("error", reject);
  });
} finally {
  fixture.kill();
  lines.close();
  await rm(directory, { recursive: true, force: true });
}
