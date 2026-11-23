import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync } from "node:fs";
import { previewSourceHash } from "./preview-source.mjs";
const cwd = fileURLToPath(new URL("../preview", import.meta.url));
const flutter = process.env.FLUTTER_BIN || "flutter";
const sourceHash = previewSourceHash();
const manifest = new URL(
  "../public/flutter-preview/source-manifest.json",
  import.meta.url,
);
rmSync(manifest, { force: true });
for (const args of [
  ["pub", "get"],
  [
    "build",
    "web",
    "--release",
    "--no-wasm-dry-run",
    "--base-href=/flutter-preview/",
    "--output=../public/flutter-preview",
  ],
]) {
  const result = spawnSync(flutter, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (previewSourceHash() !== sourceHash)
  throw new Error(
    "SDK or preview source changed during the build. Rebuild before serving this preview.",
  );
writeFileSync(manifest, JSON.stringify({ sourceHash }));
