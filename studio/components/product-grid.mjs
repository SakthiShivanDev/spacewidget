import component from "./product-grid.json" with { type: "json" };
import {
  hydrate,
  insertInto,
  nodes,
  updateNode,
  uid,
} from "../shared/model.js";
import { properties } from "../web/widget-catalog.js";
import { parseDefinition, widgetTypes } from "../server/schema.mjs";

export const productGrid = component;

export function addProductGrid(document, screenId = "main") {
  const doc = hydrate(structuredClone(document), widgetTypes);
  if (doc.components.some((item) => item.id === productGrid.id))
    throw new Error(
      "A product-grid component already exists. Customize that component instead.",
    );
  const screen = doc.screens.find((item) => item.id === screenId);
  if (!screen) throw new Error(`Screen ${screenId} does not exist.`);
  if (
    !screen.queries.some((query) => query.id === "products") &&
    !Array.isArray(screen.state.products)
  )
    throw new Error(
      "Connect a products list data source to this screen first.",
    );
  const lists = nodes(screen.tree).filter(
    (node) =>
      properties(node).type === "repeat" &&
      properties(node).items === "{{products}}",
  );
  if (lists.length > 1)
    throw new Error(
      "This screen has multiple product lists; select the one to replace in Studio.",
    );
  doc.components.push(hydrate(structuredClone(productGrid), widgetTypes));
  const instance = {
    type: "component",
    id: lists[0]?.id || uid(),
    componentId: productGrid.id,
    values: { items: "{{products}}" },
  };
  screen.tree = lists.length
    ? updateNode(screen.tree, lists[0].id, () => instance)
    : insertInto(screen.tree, null, instance);
  return parseDefinition(doc);
}
