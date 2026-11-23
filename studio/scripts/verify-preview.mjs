import { readFileSync } from "node:fs";
import { previewSourceHash } from "./preview-source.mjs";
let manifest;
try {
  manifest = JSON.parse(
    readFileSync(
      new URL(
        "../public/flutter-preview/source-manifest.json",
        import.meta.url,
      ),
    ),
  );
} catch {
  throw new Error(
    "Flutter preview is missing. Run npm run preview:build before packaging Studio.",
  );
}
if (manifest.sourceHash !== previewSourceHash())
  throw new Error(
    "Flutter preview is stale. Run npm run preview:build using the current SDK source.",
  );
console.log("Flutter preview matches the SDK source.");
