const text = (value, size = 16) => ({
  type: "text",
  text: value,
  fontSize: size,
});
const button = (label, action) => ({
  type: "filledButton",
  text: label,
  action,
});
const navigate = (screen) => ({
  type: "navigate",
  source: `/runtime/screens/${screen}`,
});
const screen = (title, children) => ({
  type: "scaffold",
  appBar: { type: "appBar", title },
  body: {
    type: "safeArea",
    child: { type: "listView", padding: 24, children },
  },
});
export function starter(connectionId) {
  return {
    schemaVersion: 1,
    initialScreen: "main",
    theme: { seedColor: "#7763e8" },
    components: [
      {
        id: "welcome-card",
        name: "Welcome card",
        defaults: {
          title: "Make room for good things.",
          subtitle: "A little inspiration for your everyday.",
        },
        tree: {
          type: "container",
          padding: 24,
          backgroundColor: "#272332",
          borderRadius: 20,
          child: {
            type: "column",
            crossAxisAlignment: "start",
            spacing: 12,
            children: [
              {
                ...text("{{props.title}}", 26),
                color: "#FFFFFF",
                fontWeight: 600,
              },
              { ...text("{{props.subtitle}}", 14), color: "#D3CFDF" },
            ],
          },
        },
      },
    ],
    screens: [
      {
        id: "main",
        name: "Main",
        public: true,
        state: {},
        queries: [
          {
            id: "products",
            connectionId,
            table: "products",
            select: ["id", "name", "category", "price"],
            scope: "public",
            ownerColumn: "user_id",
            filters: [
              {
                column: "name",
                op: "contains",
                value: { from: "query", key: "q" },
                optional: true,
              },
            ],
            orderBy: "id",
            direction: "asc",
            limit: 12,
            single: false,
          },
        ],
        tree: screen("Everyday", [
          {
            type: "row",
            mainAxisAlignment: "spaceBetween",
            children: [
              text("Your daily edit", 28),
              {
                type: "iconButton",
                icon: "person",
                tooltip: "Profile",
                action: navigate("profile"),
              },
            ],
          },
          { type: "sizedBox", height: 24 },
          {
            type: "component",
            id: "hero",
            componentId: "welcome-card",
            values: {},
          },
          { type: "sizedBox", height: 28 },
          {
            type: "row",
            mainAxisAlignment: "spaceBetween",
            children: [
              text("Thoughtfully selected", 20),
              { ...text("THE COLLECTION", 11), color: "#7567AC" },
            ],
          },
          { type: "sizedBox", height: 16 },
          {
            type: "repeat",
            items: "{{products}}",
            template: {
              type: "card",
              child: {
                type: "listTile",
                title: "{{item.name}}",
                subtitle: "{{item.category}}",
                trailing: { type: "text", text: "USD {{item.price}}" },
              },
            },
          },
          { type: "sizedBox", height: 20 },
          button("Explore your profile", navigate("profile")),
        ]),
      },
      {
        id: "profile",
        name: "Profile",
        public: false,
        state: {},
        queries: [
          {
            id: "user",
            connectionId,
            table: "profiles",
            select: ["id", "name", "email", "avatar_url"],
            scope: "user",
            ownerColumn: "user_id",
            filters: [],
            orderBy: "id",
            direction: "asc",
            limit: 1,
            single: true,
          },
        ],
        tree: screen("Your profile", [
          { type: "circleAvatar", text: "{{user.name}}", radius: 36 },
          { type: "sizedBox", height: 20 },
          text("Hello, {{user.name}}", 28),
          text("{{user.email}}"),
          { type: "sizedBox", height: 24 },
          {
            type: "form",
            id: "edit-profile",
            children: [
              {
                type: "input",
                name: "name",
                label: "Display name",
                initialValue: "{{user.name}}",
                required: true,
                maxLength: 120,
              },
              { type: "sizedBox", height: 16 },
              button("Save profile", {
                type: "submit",
                source: "/runtime/actions/save-profile",
                method: "POST",
                onSuccess: { type: "refresh" },
                onFailure: {
                  type: "snackbar",
                  message: "Unable to save. Please try again.",
                },
              }),
            ],
          },
          { type: "sizedBox", height: 20 },
          button("Sign out", {
            type: "operation",
            name: "authLogout",
            onSuccess: { type: "refresh" },
          }),
        ]),
      },
      {
        id: "sign-in",
        name: "Sign in",
        public: true,
        state: {},
        queries: [],
        tree: screen("Welcome back", [
          { type: "loginForm", onSuccess: navigate("profile") },
        ]),
      },
    ],
    actions: [
      {
        id: "save-profile",
        connectionId,
        table: "profiles",
        operation: "update",
        ownerColumn: "user_id",
        fields: {
          name: {
            column: "name",
            type: "string",
            required: true,
            maxLength: 120,
          },
        },
        filters: [],
      },
    ],
  };
}
