import { readFileSync } from "node:fs";
import { parseFigmaPackage, figmaFrameTree } from "../web/figma-import.js";
const exported = parseFigmaPackage(
  JSON.parse(
    readFileSync(new URL("./fixtures/figma-design.json", import.meta.url)),
  ),
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      ["editable", "snapshot"].map((mode) => [
        mode,
        {
          type: "scaffold",
          backgroundColor: "#FFFFFF",
          body: figmaFrameTree(exported.frames[0], mode),
        },
      ]),
    ),
  ),
);
