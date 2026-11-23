import { hydrate } from "../../shared/document.mjs";
import widgetTypes from "../../shared/widget-types.json" with { type: "json" };
import {
  createStorefrontDesign,
  storefrontProductImage,
} from "./storefront.mjs";
const text = (value, size = 16, extra = {}) => ({
  type: "text",
  text: value,
  fontSize: size,
  ...extra,
});
const space = (height) => ({ type: "sizedBox", height });
const button = (label, action, type = "filledButton") => ({
  type,
  label,
  action,
});
const message = (message) => ({ type: "snackbar", message });
const request = (path, data, onSuccess = { type: "refresh" }) => ({
  type: "request",
  method: "POST",
  source: `/runtime/commerce/${path}`,
  data,
  resultPath: "response",
  onSuccess,
  onFailure: message("{{response.message}}"),
});
const nav = (screen, query = {}, replace = false) => ({
  type: replace ? "replace" : "navigate",
  source: `/runtime/screens/${screen}`,
  query,
  refreshOnReturn: true,
});
const empty = (title) => ({
  type: "padding",
  padding: 24,
  child: text(title, 18),
});
const row = (children) => ({
  type: "row",
  mainAxisAlignment: "spaceBetween",
  children,
});
const list = (children) => ({ type: "listView", padding: 20, children });
const bottom = (selectedIndex) => ({
  type: "navigationBar",
  selectedIndex,
  destinations: [
    { icon: "home", label: "Shop", action: nav("shop", {}, true) },
    { icon: "shopping_cart", label: "Cart", action: nav("cart", {}, true) },
    { icon: "receipt_long", label: "Orders", action: nav("orders", {}, true) },
    { icon: "person", label: "Account", action: nav("account", {}, true) },
  ],
});
const scaffold = (title, children, index) => ({
  type: "scaffold",
  appBar: { type: "appBar", title },
  ...(index === undefined ? {} : { bottomNavigationBar: bottom(index) }),
  body: {
    type: "safeArea",
    child: { type: "refreshIndicator", child: list(children) },
  },
});
const screen = (id, name, tree, loader, isPublic = false, state = {}) => ({
  id,
  name,
  public: isPublic,
  state,
  queries: [],
  ...(loader ? { loader } : {}),
  tree,
});
const productImage = {
  type: "image",
  src: "{{item.image}}",
  height: 120,
  width: 400,
  fit: "cover",
};
const add = request(
  "cart",
  { productId: "{{item.id}}", quantity: 1, add: true },
  message("Added to your cart"),
);
const productDetails = {
  type: "bottomSheet",
  onDismiss: {
    type: "if",
    condition: "{{event.result.added}}",
    then: message("Added to your cart"),
  },
  content: {
    type: "padding",
    padding: 24,
    child: {
      type: "column",
      mainAxisSize: "min",
      crossAxisAlignment: "start",
      spacing: 14,
      children: [
        productImage,
        text("{{item.name}}", 24, { fontWeight: 700 }),
        text("{{item.description}}"),
        text("{{item.priceLabel}}", 20),
        {
          type: "authGate",
          then: {
            ...button("Add to cart", {
              ...add,
              onSuccess: { type: "pop", result: { added: true } },
            }),
            enabled: "{{item.inStock}}",
          },
          else: button("Sign in", nav("account"), "outlinedButton"),
        },
        text("{{response.message}}", 14, { color: "@theme.error" }),
        button("Close", { type: "pop" }, "textButton"),
      ],
    },
  },
};
const sampleProduct = {
  id: "headphones",
  name: "Studio headphones",
  category: "Audio",
  description: "Clear sound for focused work.",
  price: 8900,
  priceLabel: "USD 89.00",
  image:
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop",
  stock: 24,
  inStock: true,
};
const orderNav = nav("order", { orderId: "{{item.id}}" });
export function commerceTemplate() {
  const storefront = createStorefrontDesign({ productDetails, add });
  return hydrate(
    {
      schemaVersion: 1,
      features: ["commerce"],
      initialScreen: "shop",
      theme: storefront.theme,
      themeMode: "light",
      actions: [],
      components: [
        {
          id: "shop-product",
          name: "Product card",
          defaults: {},
          tree: storefront.productCard,
        },
        {
          id: "product-list",
          name: "Product grid",
          defaults: {},
          tree: storefront.productGrid,
        },
      ],
      screens: [
        screen("shop", "Shop", storefront.tree, "catalog", true, {
          products: [
            {
              id: "lamp",
              name: "Desk lamp",
              category: "Home",
              description: "Warm, adjustable light for your reading corner.",
              price: 4200,
              priceLabel: "USD 42.00",
              image: storefrontProductImage("lamp"),
              stock: 31,
              inStock: true,
            },
            {
              id: "backpack",
              name: "Everyday backpack",
              category: "Accessories",
              description: "A durable carry for class, work and weekends.",
              price: 6400,
              priceLabel: "USD 64.00",
              image: storefrontProductImage("backpack"),
              stock: 18,
              inStock: true,
            },
            sampleProduct,
          ],
          search: "",
          category: "",
          sort: "",
          ...storefront.state,
          displayProducts: [
            {
              id: "lamp",
              name: "Desk lamp",
              category: "Home",
              priceLabel: "USD 42.00",
              image: storefrontProductImage("lamp"),
              inStock: true,
            },
            {
              id: "backpack",
              name: "Everyday backpack",
              category: "Accessories",
              priceLabel: "USD 64.00",
              image: storefrontProductImage("backpack"),
              inStock: true,
            },
          ],
        }),
        screen(
          "cart",
          "Cart",
          scaffold(
            "Your cart",
            [
              {
                type: "repeat",
                items: "{{cart.items}}",
                empty: empty(
                  "Your cart is empty. Explore the shop to add something.",
                ),
                template: {
                  type: "card",
                  child: {
                    type: "padding",
                    padding: 14,
                    child: {
                      type: "column",
                      crossAxisAlignment: "start",
                      spacing: 8,
                      children: [
                        text("{{item.name}}", 18),
                        text(
                          "{{item.quantity}} × {{item.priceLabel}} · {{item.lineTotal}}",
                        ),
                        row([
                          button(
                            "Add one",
                            request("cart", {
                              productId: "{{item.id}}",
                              quantity: 1,
                              add: true,
                            }),
                          ),
                          button(
                            "Remove",
                            {
                              type: "dialog",
                              onDismiss: { type: "refresh" },
                              content: {
                                type: "alertDialog",
                                title: "Remove item?",
                                content: text(
                                  "Remove {{item.name}} from your cart?",
                                ),
                                actions: [
                                  button("Keep", { type: "pop" }, "textButton"),
                                  button(
                                    "Remove item",
                                    request(
                                      "cart",
                                      { productId: "{{item.id}}", quantity: 0 },
                                      { type: "pop" },
                                    ),
                                    "textButton",
                                  ),
                                ],
                              },
                            },
                            "textButton",
                          ),
                        ]),
                      ],
                    },
                  },
                },
              },
              space(16),
              text("Total · {{cart.totalLabel}}", 24, { fontWeight: 700 }),
              space(16),
              {
                type: "conditional",
                condition: "{{cart.hasItems}}",
                then: button("Delivery & checkout", nav("checkout")),
                else: button("Explore the shop", nav("shop", {}, true)),
              },
            ],
            1,
          ),
          "cart",
          false,
          { cart: { items: [], totalLabel: "USD 0.00" } },
        ),
        screen(
          "checkout",
          "Checkout",
          scaffold("Delivery & checkout", [
            text("Order total · {{cart.totalLabel}}", 24),
            space(16),
            {
              type: "conditional",
              condition: "{{demoPayments}}",
              then: {
                type: "container",
                padding: 16,
                backgroundColor: "#fef3c7",
                child: text(
                  "TEST PAYMENTS · No money is charged. Confirm or cancel on the next screen.",
                ),
              },
            },
            space(16),
            {
              type: "form",
              id: "delivery-form",
              children: [
                {
                  type: "input",
                  name: "address",
                  label: "Delivery address",
                  required: true,
                  minLength: 10,
                  maxLength: 1000,
                  maxLines: 4,
                },
                space(16),
                {
                  ...button("Place order", {
                    ...request(
                      "checkout",
                      { idempotencyKey: "{{cart.checkoutKey}}" },
                      nav("order", { orderId: "{{response.order.id}}" }, true),
                    ),
                    type: "submit",
                    form: "delivery-form",
                  }),
                  enabled: "{{cart.hasItems}}",
                },
              ],
            },
          ]),
          "cart",
          false,
          {
            cart: {
              totalLabel: "USD 89.00",
              hasItems: true,
              checkoutKey: "sample-only",
            },
            demoPayments: true,
          },
        ),
        screen(
          "order",
          "Order details",
          scaffold("Order details", [
            text("Order {{order.id}}", 18),
            text("Status · {{order.status}}", 24),
            text("Total · {{order.totalLabel}}", 24),
            text("Deliver to: {{order.address}}"),
            space(16),
            {
              type: "repeat",
              items: "{{order.items}}",
              template: {
                type: "listTile",
                title: "{{item.name}}",
                subtitle: "Quantity {{item.quantity}}",
                trailing: text("{{item.lineTotal}}"),
              },
            },
            space(16),
            {
              type: "conditional",
              condition: "{{order.pending}}",
              then: {
                type: "column",
                spacing: 12,
                children: [
                  {
                    type: "conditional",
                    condition: "{{demoPayments}}",
                    then: button(
                      "Confirm TEST payment (no charge)",
                      request("demo-confirm", { orderId: "{{order.id}}" }),
                    ),
                    else: button(
                      "Open secure payment",
                      request(
                        "checkout",
                        { orderId: "{{order.id}}" },
                        {
                          type: "if",
                          condition: "{{response.canOpen}}",
                          then: {
                            type: "operation",
                            name: "checkout",
                            data: {
                              url: "{{response.checkoutUrl}}",
                              sessionId: "{{response.sessionId}}",
                              orderId: "{{order.id}}",
                            },
                          },
                          else: { type: "refresh" },
                        },
                      ),
                    ),
                  },
                  button(
                    "Check payment status",
                    request("verify", { orderId: "{{order.id}}" }),
                  ),
                  button(
                    "Cancel unpaid order",
                    {
                      type: "dialog",
                      onDismiss: { type: "refresh" },
                      content: {
                        type: "alertDialog",
                        title: "Cancel this order?",
                        content: text(
                          "Reserved items will be returned to stock. A paid order cannot be cancelled here.",
                        ),
                        actions: [
                          button("Keep order", { type: "pop" }, "textButton"),
                          button(
                            "Cancel order",
                            request(
                              "cancel",
                              { orderId: "{{order.id}}" },
                              { type: "pop" },
                            ),
                            "textButton",
                          ),
                        ],
                      },
                    },
                    "outlinedButton",
                  ),
                ],
              },
            },
            button("View all orders", nav("orders", {}, true), "textButton"),
          ]),
          "order",
          false,
          {
            order: {
              id: "Sample order",
              pending: true,
              status: "pending",
              totalLabel: "USD 89.00",
              address: "Your delivery address",
              items: [
                { ...sampleProduct, quantity: 1, lineTotal: "USD 89.00" },
              ],
            },
            demoPayments: true,
          },
        ),
        screen(
          "orders",
          "Orders",
          scaffold(
            "Your orders",
            [
              {
                type: "repeat",
                items: "{{orders}}",
                empty: empty("No orders yet. Your purchases will appear here."),
                template: {
                  type: "card",
                  child: {
                    type: "listTile",
                    title: "{{item.totalLabel}} · {{item.status}}",
                    subtitle: "{{item.created}}",
                    action: orderNav,
                  },
                },
              },
            ],
            2,
          ),
          "orders",
          false,
          { orders: [] },
        ),
        screen(
          "account",
          "Account",
          scaffold(
            "Your account",
            [
              {
                type: "authGate",
                then: {
                  type: "column",
                  crossAxisAlignment: "start",
                  spacing: 16,
                  children: [
                    text("Hello, {{app.auth.user.name}}", 26),
                    text("{{app.auth.user.email}}"),
                    button("Order history", nav("orders")),
                    button("Notifications", nav("notifications")),
                    button(
                      "Sign out",
                      { type: "operation", name: "authLogout" },
                      "outlinedButton",
                    ),
                  ],
                },
                else: {
                  type: "column",
                  spacing: 16,
                  children: [
                    { type: "loginForm", onSuccess: { type: "refresh" } },
                    {
                      type: "conditional",
                      condition: "{{capabilities.googleOAuth}}",
                      then: button(
                        "Continue with Google",
                        { type: "operation", name: "authOAuth" },
                        "outlinedButton",
                      ),
                    },
                  ],
                },
              },
              space(24),
              {
                type: "defaultTabController",
                length: 2,
                child: {
                  type: "column",
                  mainAxisSize: "min",
                  children: [
                    {
                      type: "tabBar",
                      bind: "helpTab",
                      children: [
                        { type: "tab", text: "Delivery" },
                        { type: "tab", text: "Support" },
                      ],
                    },
                    {
                      type: "sizedBox",
                      height: 150,
                      child: {
                        type: "tabBarView",
                        children: [
                          empty(
                            "Your order total and delivery address are confirmed before payment.",
                          ),
                          empty(
                            "Contact support for returns, refunds or a delivery question.",
                          ),
                        ],
                      },
                    },
                  ],
                },
              },
            ],
            3,
          ),
          null,
          true,
        ),
        screen(
          "notifications",
          "Notifications",
          scaffold("Notifications", [
            {
              type: "repeat",
              items: "{{notifications}}",
              empty: empty("You are up to date."),
              template: {
                type: "card",
                child: {
                  type: "listTile",
                  title: "{{item.title}}",
                  subtitle: "{{item.body}}",
                  action: {
                    type: "request",
                    method: "GET",
                    source: "/runtime/push/notifications/{{item.id}}",
                    resultPath: "notificationTarget",
                    onSuccess: nav(
                      "{{notificationTarget.screenId}}",
                      "{{notificationTarget.query}}",
                    ),
                    onFailure: message(
                      "This notification is no longer available.",
                    ),
                  },
                },
              },
            },
          ]),
          "notifications",
          false,
          { notifications: [] },
        ),
      ],
      // A reusable grid keeps product actions and repeated data together.
    },
    [...widgetTypes, "component"],
  );
}
// Both product components use the same editable design in Studio and runtime.
export function createCommerceTemplate() {
  return commerceTemplate();
}
