import { readFileSync } from "node:fs";

const assets = new Map();
export function storefrontAsset(file, mime = "image/jpeg") {
  if (!assets.has(file))
    assets.set(
      file,
      `data:${mime};base64,${readFileSync(new URL(`../../assets/storefront/${file}`, import.meta.url)).toString("base64")}`,
    );
  return assets.get(file);
}
export const storefrontProductImage = (id) =>
  ["lamp", "backpack"].includes(id) ? storefrontAsset(`${id}.jpg`) : null;
const blue = "#1245ff",
  ink = "#1d2344",
  muted = "#535970";
const txt = (text, fontSize = 14, extra = {}) => ({
  type: "text",
  text,
  fontSize,
  color: ink,
  ...extra,
});
const gap = (height) => ({ type: "sizedBox", height });
const icon = (name, size = 24, color = ink) => ({
  type: "icon",
  name,
  size,
  color,
});
const flex = (child, n = 1) => ({ type: "expanded", flex: n, child });
const row = (children, extra = {}) => ({ type: "row", children, ...extra });
const col = (children, extra = {}) => ({
  type: "column",
  children,
  crossAxisAlignment: "start",
  mainAxisSize: "min",
  ...extra,
});
const box = (child, extra = {}) => ({ type: "container", child, ...extra });
const nav = (screen, query = {}, replace = false) => ({
  type: replace ? "replace" : "navigate",
  source: `/runtime/screens/${screen}`,
  query,
  refreshOnReturn: true,
});
const set = (path, value) => ({ type: "set", path, value });
const say = (message) => ({ type: "snackbar", message });
const fitText = (value, size, extra = {}) => ({
  type: "fittedBox",
  fit: "scaleDown",
  alignment: "centerLeft",
  child: txt(value, size, extra),
});
const soft = {
  backgroundColor: "#ffffff",
  borderRadius: 18,
  elevation: 14,
  shadowColor: "#12616bc8",
};

export const storefrontCategorySelection = (category = "") => ({
  all: category === "",
  home: category === "Home",
  electronics: category === "Audio",
  accessories: category === "Accessories",
  gifts: category === "Gifts",
  more: !["", "Home", "Audio", "Accessories", "Gifts"].includes(category),
});
export const storefrontState = () => ({
  categorySelection: storefrontCategorySelection(),
  heroTitle: "Thoughtful products.",
  heroSubtitle: "Simple shopping.",
  heroTag: "EVERYDAY ESSENTIALS",
  heroCategory: "",
  heroActive: { one: true, two: false, three: false, four: false },
});
const loadCatalog = (category = "{{category}}", sort = "{{sort}}") => ({
  type: "request",
  source: "/runtime/commerce/products",
  method: "GET",
  query: { q: "{{search}}", category, sort },
  resultPath: "catalogResult",
  onSuccess: [
    set("products", "{{catalogResult.products}}"),
    set("displayProducts", "{{catalogResult.products}}"),
    set("category", "{{catalogResult.category}}"),
    set("categorySelection", "{{catalogResult.categorySelection}}"),
    set("sort", sort),
  ],
  onFailure: say("{{catalogResult.message}}"),
});
const searchOptions = {
  type: "bottomSheet",
  content: {
    type: "padding",
    padding: 24,
    child: col([
      txt("Find your everyday", 23, { fontWeight: 800 }),
      gap(8),
      txt("Choose a collection or sort the products.", 14, { color: muted }),
      gap(18),
      ...[
        ["All categories", ""],
        ["Home", "Home"],
        ["Electronics", "Audio"],
        ["Accessories", "Accessories"],
        ["Gifts", "Gifts"],
      ].map(([label, value]) => ({
        type: "textButton",
        label,
        action: [loadCatalog(value), { type: "pop" }],
      })),
      { type: "divider" },
      ...[
        ["Price: low to high", "priceAsc"],
        ["Price: high to low", "priceDesc"],
        ["Name: A to Z", "name"],
      ].map(([label, sort]) => ({
        type: "textButton",
        label,
        action: [loadCatalog("{{category}}", sort), { type: "pop" }],
      })),
    ]),
  },
};
function control(label, child, action, extra = {}) {
  return {
    type: "semantics",
    label,
    button: true,
    child: {
      type: "inkWell",
      action,
      borderRadius: 16,
      child: box(child, extra),
    },
  };
}
function pill(
  label,
  action,
  { scale = 1, outlined = false, cart = false } = {},
) {
  return {
    type: "sizedBox",
    height: 31 * scale,
    child: {
      type: outlined ? "outlinedButton" : "filledButton",
      label,
      action,
      backgroundColor: outlined ? "#ffffff" : blue,
      ...(outlined ? { borderColor: "#bdc8ff", borderWidth: 0.8 } : {}),
      color: outlined ? blue : "#ffffff",
      borderRadius: 30,
      padding: { horizontal: 4 * scale, vertical: 3 * scale },
      child: {
        type: "fittedBox",
        fit: "scaleDown",
        child: row(
          [
            ...(cart
              ? [
                  icon("shopping_cart", 13 * scale, blue),
                  { type: "sizedBox", width: 4 * scale },
                ]
              : []),
            txt(label, 10.5 * scale, {
              fontWeight: 800,
              color: outlined ? blue : "#ffffff",
            }),
          ],
          { mainAxisSize: "min" },
        ),
      },
    },
  };
}
function header(s) {
  const profile = control(
    "Your account",
    icon("person_filled", 23 * s),
    nav("account"),
    {
      width: 31 * s,
      height: 31 * s,
      backgroundColor: "#e9e9f7",
      borderRadius: 40,
    },
  );
  const bell = {
    type: "authGate",
    then: control(
      "Notifications",
      icon("notifications", 25 * s),
      nav("notifications"),
      { width: 35 * s, height: 35 * s },
    ),
    else: control(
      "Notifications",
      icon("notifications", 25 * s),
      nav("account"),
      { width: 35 * s, height: 35 * s },
    ),
  };
  return row(
    [
      box(icon("shopping_bag", 21 * s, "#ffffff"), {
        width: 31 * s,
        height: 31 * s,
        borderRadius: 11 * s,
        backgroundColor: "#454cff",
        alignment: "center",
        elevation: 10,
        shadowColor: "#22464cff",
      }),
      { type: "sizedBox", width: 9 * s },
      flex(
        fitText("Everyday Store", 19 * s, {
          fontWeight: 800,
          letterSpacing: -0.6 * s,
        }),
      ),
      bell,
      { type: "sizedBox", width: 10 * s },
      profile,
    ],
    { crossAxisAlignment: "center" },
  );
}
function banner(s) {
  return {
    type: "constrainedBox",
    minHeight: 134 * s,
    child: {
      type: "aspectRatio",
      aspectRatio: 2.65,
      child: {
        type: "clipRRect",
        borderRadius: 19 * s,
        child: {
          type: "stack",
          children: [
            {
              type: "positioned",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              child: {
                type: "image",
                src: storefrontAsset("hero.jpg"),
                fit: "cover",
                semanticLabel: "Headphones, a plant and a warm table lamp",
              },
            },
            {
              type: "positioned",
              top: 18 * s,
              left: 22 * s,
              bottom: 17 * s,
              right: 14 * s,
              child: {
                type: "fractionallySizedBox",
                widthFactor: 0.62,
                alignment: "centerLeft",
                child: col(
                  [
                    fitText("{{heroTag}}", 9 * s, {
                      color: "#ffffff",
                      fontWeight: 700,
                      letterSpacing: 1.7 * s,
                    }),
                    gap(6 * s),
                    fitText("{{heroTitle}}", 20.5 * s, {
                      lineHeight: 1.12,
                      color: "#ffffff",
                      fontWeight: 800,
                      letterSpacing: -0.5 * s,
                    }),
                    fitText("{{heroSubtitle}}", 20.5 * s, {
                      lineHeight: 1.12,
                      color: "#e4d5ff",
                      fontWeight: 800,
                      letterSpacing: -0.5 * s,
                    }),
                    { type: "spacer" },
                    {
                      type: "sizedBox",
                      height: 29 * s,
                      width: 102 * s,
                      child: {
                        type: "filledButton",
                        backgroundColor: "#ffffff",
                        color: ink,
                        borderRadius: 30,
                        padding: { horizontal: 12 * s },
                        action: [
                          { type: "set", path: "browseProducts", value: true },
                          loadCatalog("{{heroCategory}}"),
                        ],
                        child: row(
                          [
                            txt("Shop Now", 11 * s, { fontWeight: 700 }),
                            icon("arrow_forward", 16 * s),
                          ],
                          { mainAxisAlignment: "spaceBetween" },
                        ),
                      },
                    },
                  ],
                  { mainAxisSize: "max" },
                ),
              },
            },
          ],
        },
      },
    },
  };
}
function carouselDots(s) {
  const slides = [
    [
      "one",
      "Thoughtful products.",
      "Simple shopping.",
      "EVERYDAY ESSENTIALS",
      "",
    ],
    [
      "two",
      "A little more comfort.",
      "A lot more home.",
      "MAKE YOURSELF AT HOME",
      "Home",
    ],
    [
      "three",
      "Made to go with you.",
      "Every single day.",
      "YOUR DAILY COMPANIONS",
      "Accessories",
    ],
    [
      "four",
      "Find your focus.",
      "Enjoy every moment.",
      "SOUND GOOD. FEEL GOOD.",
      "Audio",
    ],
  ];
  return row(
    slides.map(([key, title, subtitle, tag, category], index) =>
      control(
        `Promotion ${index + 1}`,
        {
          type: "conditional",
          condition: `{{heroActive.${key}}}`,
          then: box(null, {
            width: 10 * s,
            height: 5 * s,
            backgroundColor: blue,
            borderRadius: 10,
          }),
          else: box(null, {
            width: 5 * s,
            height: 5 * s,
            backgroundColor: "#cbd1f7",
            borderRadius: 10,
          }),
        },
        [
          set("heroTitle", title),
          set("heroSubtitle", subtitle),
          set("heroTag", tag),
          set("heroCategory", category),
          set(
            "heroActive",
            Object.fromEntries(slides.map(([id]) => [id, id === key])),
          ),
        ],
        { width: 13 * s, height: 23 * s, alignment: "center" },
      ),
    ),
    { mainAxisAlignment: "center" },
  );
}
function categoryTile(label, name, key, value, s) {
  const content = (selected) =>
    box(
      col(
        [
          icon(name, 24 * s, selected ? blue : ink),
          gap(5 * s),
          {
            type: "sizedBox",
            height: 23 * s,
            child: {
              type: "fittedBox",
              fit: "scaleDown",
              child: txt(label, 10.5 * s, {
                fontWeight: selected ? 800 : 500,
                textAlign: "center",
                color: selected ? "#101328" : ink,
              }),
            },
          },
        ],
        {
          mainAxisAlignment: "center",
          crossAxisAlignment: "center",
          mainAxisSize: "max",
        },
      ),
      {
        height: 73 * s,
        padding: { horizontal: 4 * s, vertical: 8 * s },
        borderRadius: 17 * s,
        backgroundColor: selected ? "#e1e7ff" : "#fdfdff",
        elevation: 15,
        shadowColor: "#145361c7",
        ...(selected ? { borderColor: "#d2dcff", borderWidth: 0.7 } : {}),
      },
    );
  return flex(
    control(
      "",
      {
        type: "conditional",
        condition: `{{categorySelection.${key}}}`,
        then: content(true),
        else: content(false),
      },
      key === "more"
        ? searchOptions
        : [set("browseProducts", true), loadCatalog(value)],
      {},
    ),
    key === "all" ? 13 : 10,
  );
}
function storefrontBody(s) {
  return {
    type: "refreshIndicator",
    child: {
      type: "listView",
      padding: { horizontal: 13 * s, top: 12 * s, bottom: 18 * s },
      children: [
        { type: "padding", padding: { horizontal: 9 * s }, child: header(s) },
        gap(21 * s),
        {
          type: "conditional",
          condition: "{{browseProducts}}",
          else: col([banner(s), carouselDots(s), gap(8 * s)]),
        },
        row(
          [
            flex(
              box(
                {
                  type: "searchField",
                  id: "storefront-search",
                  name: "q",
                  bind: "search",
                  hint: "Search for products, brands and more…",
                  icon: "search",
                  initialValue: "{{search}}",
                  debounce: 450,
                  borderRadius: 16 * s,
                  borderColor: "#d7dcff",
                  backgroundColor: "#fcfcff",
                  filled: true,
                  fontSize: 12 * s,
                  onChanged: loadCatalog(),
                  onSubmitted: loadCatalog(),
                  textInputAction: "search",
                  padding: { horizontal: 14 * s, vertical: 13 * s },
                },
                { ...soft, borderRadius: 16 * s },
              ),
            ),
            { type: "sizedBox", width: 9 * s },
            control(
              "Search options",
              icon("qr_code_scanner", 23 * s),
              searchOptions,
              {
                ...soft,
                width: 46 * s,
                height: 46 * s,
                borderColor: "#e2e5ff",
                borderWidth: 0.7,
                alignment: "center",
                borderRadius: 16 * s,
              },
            ),
          ],
          { crossAxisAlignment: "center" },
        ),
        gap(18 * s),
        row(
          [
            categoryTile("All\nCategories", "category", "all", "", s),
            categoryTile("Home", "chair", "home", "Home", s),
            categoryTile(
              "Electronics",
              "headphones",
              "electronics",
              "Audio",
              s,
            ),
            categoryTile(
              "Accessories",
              "backpack",
              "accessories",
              "Accessories",
              s,
            ),
            categoryTile("Gifts", "gift", "gifts", "Gifts", s),
            categoryTile("More", "more_horiz", "more", "", s),
          ],
          { spacing: 8 * s },
        ),
        gap(21 * s),
        row(
          [
            flex(
              txt("Featured Picks", 18 * s, {
                color: "#080b15",
                fontWeight: 800,
                letterSpacing: -0.6 * s,
              }),
            ),
            {
              type: "textButton",
              action: [
                set("search", ""),
                set("browseProducts", true),
                loadCatalog(""),
              ],
              padding: 0,
              child: row(
                [
                  txt("View All", 11 * s, { color: blue, fontWeight: 700 }),
                  { type: "sizedBox", width: 5 * s },
                  icon("arrow_forward", 15 * s, blue),
                ],
                { mainAxisSize: "min" },
              ),
            },
          ],
          { crossAxisAlignment: "center" },
        ),
        gap(7 * s),
        { type: "component", componentId: "product-list", values: {} },
      ],
    },
  };
}
function productCard(productDetails, add, s) {
  const addButton = (action) =>
    pill("Add to Cart", action, { outlined: true, cart: true, scale: s });
  const buyButton = (action) => pill("Buy Now", action, { scale: s });
  const actions = (authenticated) =>
    row([
      flex(addButton(authenticated ? add : nav("account"))),
      { type: "sizedBox", width: 6 * s },
      flex(
        buyButton(
          authenticated
            ? { ...add, onSuccess: nav("checkout") }
            : nav("account"),
        ),
      ),
    ]);
  return box(
    col(
      [
        flex({
          type: "clipRRect",
          borderRadius: 13 * s,
          child: {
            type: "stack",
            children: [
              {
                type: "positioned",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                child: control(
                  "View product: {{item.name}}",
                  { type: "image", src: "{{item.image}}", fit: "cover" },
                  productDetails,
                  {},
                ),
              },
              {
                type: "positioned",
                top: 7 * s,
                right: 7 * s,
                child: {
                  type: "conditional",
                  condition: "{{app.storefront.favorites.{{item.id}}}}",
                  then: {
                    type: "iconButton",
                    icon: "favorite_filled",
                    padding: 0,
                    color: blue,
                    iconSize: 20 * s,
                    tooltip: "Unsave {{item.name}}",
                    action: {
                      type: "toggle",
                      path: "app.storefront.favorites.{{item.id}}",
                    },
                  },
                  else: {
                    type: "container",
                    backgroundColor: "#ddffffff",
                    borderRadius: 30,
                    width: 25 * s,
                    height: 25 * s,
                    child: {
                      type: "iconButton",
                      icon: "favorite",
                      padding: 0,
                      iconSize: 20 * s,
                      color: "#141827",
                      tooltip: "Save {{item.name}}",
                      action: {
                        type: "toggle",
                        path: "app.storefront.favorites.{{item.id}}",
                      },
                    },
                  },
                },
              },
            ],
          },
        }),
        gap(6 * s),
        {
          type: "padding",
          padding: { horizontal: 8 * s },
          child: col([
            txt("{{item.category}}", 10 * s, { color: muted, maxLines: 1 }),
            gap(2 * s),
            fitText("{{item.name}}", 13.5 * s, {
              color: "#090b10",
              fontWeight: 800,
            }),
            gap(6 * s),
            txt("{{item.priceLabel}}", 16 * s, {
              color: blue,
              fontWeight: 800,
            }),
          ]),
        },
        gap(10 * s),
        {
          type: "conditional",
          condition: "{{item.inStock}}",
          then: { type: "authGate", then: actions(true), else: actions(false) },
          else: txt("Out of stock", 12 * s, { color: muted }),
        },
        gap(3 * s),
      ],
      { mainAxisSize: "max", crossAxisAlignment: "stretch" },
    ),
    { ...soft, padding: 7 * s, borderRadius: 18 * s, shadowColor: "#145362cc" },
  );
}
function grid(s) {
  return {
    type: "repeat",
    id: "commerce-grid",
    items: "{{displayProducts}}",
    layout: "grid",
    crossAxisCount: 2,
    crossAxisSpacing: 10 * s,
    mainAxisSpacing: 14 * s,
    mainAxisExtent: 278 * s,
    empty: box(
      col([
        icon("search", 32),
        gap(12),
        txt("No products match your search.", 16, { fontWeight: 700 }),
        gap(5),
        txt("Try another category or clear your search.", 13),
        gap(12),
        {
          type: "textButton",
          label: "Clear filters",
          action: [set("search", ""), loadCatalog("")],
        },
      ]),
      { padding: 24 },
    ),
    template: { type: "component", componentId: "shop-product", values: {} },
  };
}
export function createStorefrontDesign({ productDetails, add }) {
  const responsive = (build) => ({
    type: "responsive",
    mediumBreakpoint: 650,
    largeBreakpoint: 10000,
    small: build(1),
    medium: build(2),
  });
  return {
    theme: {
      seedColor: blue,
      primaryColor: blue,
      secondaryColor: "#6568e8",
      backgroundColor: "#fcfcff",
      surfaceColor: "#ffffff",
      onSurfaceColor: ink,
      borderRadius: 18,
      fontFamily: "Manrope",
      fonts: [
        {
          family: "Manrope",
          name: "Manrope variable",
          data: storefrontAsset("Manrope.ttf", "font/ttf"),
        },
      ],
    },
    state: storefrontState(),
    tree: {
      type: "scaffold",
      backgroundColor: "#fcfcff",
      bottomNavigationBar: responsive((s) =>
        box(
          {
            type: "navigationBar",
            id: "shop-navigation",
            selectedIndex: 0,
            destinationStyle: "pill",
            height: 70 * s,
            iconSize: 24 * s,
            fontSize: 12 * s,
            backgroundColor: "#ffffff",
            indicatorColor: "#e8ecff",
            color: ink,
            selectedColor: blue,
            destinations: [
              {
                icon: "home",
                selectedIcon: "home_filled",
                label: "Shop",
                action: nav("shop", {}, true),
              },
              {
                icon: "shopping_cart",
                label: "Cart",
                action: nav("cart", {}, true),
              },
              {
                icon: "inventory",
                label: "Orders",
                action: nav("orders", {}, true),
              },
              {
                icon: "person",
                label: "Account",
                action: nav("account", {}, true),
              },
            ],
          },
          {
            borderRadius: 30 * s,
            backgroundColor: "#ffffff",
            elevation: 20,
            shadowColor: "#15676fce",
            padding: { top: 6 * s, bottom: 6 * s, horizontal: 12 * s },
          },
        ),
      ),
      body: {
        type: "safeArea",
        bottom: false,
        child: {
          type: "center",
          child: {
            type: "constrainedBox",
            maxWidth: 1050,
            child: responsive(storefrontBody),
          },
        },
      },
    },
    productCard: {
      ...responsive((s) => productCard(productDetails, add, s)),
      mediumBreakpoint: 280,
    },
    productGrid: responsive(grid),
  };
}
