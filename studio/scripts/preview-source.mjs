import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { relative, join } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
export function previewSourceHash() {
  const files = [];
  const visit = (path) => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push(file);
    }
  };
  for (const dir of [
    "lib",
    "packages/spacewidget_adapters/lib",
    "studio/preview/lib",
    "studio/preview/assets",
  ])
    visit(join(root, dir));
  for (const file of [
    "pubspec.yaml",
    "packages/spacewidget_adapters/pubspec.yaml",
    "studio/preview/pubspec.yaml",
    "studio/preview/pubspec.lock",
  ])
    if (existsSync(join(root, file))) files.push(join(root, file));
  const hash = createHash("sha256");
  for (const file of files.sort())
    hash
      .update(relative(root, file))
      .update("\0")
      .update(readFileSync(file))
      .update("\0");
  return hash.digest("hex");
}
