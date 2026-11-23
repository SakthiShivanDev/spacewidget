import { addProductGrid } from "../components/product-grid.mjs";
import { starter } from "../server/starter.mjs";
import { expandTree } from "../server/schema.mjs";
const doc = addProductGrid(starter("connection"));
console.log(
  JSON.stringify({
    tree: expandTree(
      {
        type: "scaffold",
        body: {
          type: "listView",
          padding: 24,
          children: [
            {
              type: "component",
              id: "grid-preview",
              componentId: "product-grid",
              values: {},
            },
          ],
        },
      },
      doc,
    ),
    products: [
      {
        id: "p1",
        name: "Studio headphones with a long product name",
        category: "Audio",
        price: 89,
      },
      {
        id: "p2",
        name: "Everyday backpack",
        category: "Accessories",
        price: 64,
      },
      { id: "p3", name: "Desk lamp", category: "Home", price: 0 },
    ],
  }),
);
