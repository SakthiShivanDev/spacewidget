import { widget, insertInto } from "../web/model.js";
import { readFileSync } from "node:fs";
const core = readFileSync(
  new URL("../../lib/src/widgets.dart", import.meta.url),
  "utf8",
)
  .split("const spaceWidgetTypes")[1]
  .split("Widget _buildWidget")[0];
const types = [...core.matchAll(/'([^']+)'/g)].map((match) => match[1]);
console.log(
  JSON.stringify(
    types.map((type) => ({
      type,
      tree: insertInto(
        {
          type: "scaffold",
          id: "screen",
          body: {
            type: "listView",
            shrinkWrap: true,
            primary: false,
            children: [],
          },
        },
        null,
        widget(type),
      ),
    })),
  ),
);
