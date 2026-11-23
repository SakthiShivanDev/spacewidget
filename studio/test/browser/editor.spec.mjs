import { readFileSync } from "node:fs";
import { createServer as createImageServer } from "node:http";
import { addProductGrid } from "../../components/product-grid.mjs";
import { widget, nodes } from "../../web/model.js";
import { widgetTypes } from "../../server/schema.mjs";
import { test, expect } from "@playwright/test";
const credentials = {
  email: "builder@example.com",
  password: "browser-test-password",
};
let studioCookies;
test.beforeEach(async ({ page, request }) => {
  page.on("request", (r) => {
    if (
      /\/api\/apps\/[^/]+\/preview$/.test(new URL(r.url()).pathname) &&
      r.method() === "POST"
    )
      page.studioDocument = r.postDataJSON().document;
  });
  if ((await (await request.get("/api/setup")).json()).required)
    await request.post("/api/setup", {
      headers: { "x-setup-token": "browser-test-setup-token-long-enough" },
      data: credentials,
    });
  await page.addInitScript(() => {
    window.previewMessages = [];
    window.addEventListener("message", (e) => {
      if (
        e.origin === location.origin &&
        e.data?.type?.startsWith("spacewidget-preview")
      )
        window.previewMessages.push(e.data);
    });
  });
  if (studioCookies) {
    await page.context().addCookies(studioCookies);
    const loaded = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/apps" &&
        r.request().method() === "GET",
    );
    await page.goto("/");
    const apps = await (await loaded).json();
    if (apps.length) await nativeReady(page);
    return;
  }
  await page.goto("/");
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password", { exact: true }).fill(credentials.password);
  const appsLoaded = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/apps" &&
      r.request().method() === "GET",
  );
  await page.getByRole("button", { name: "Sign in to Studio" }).click();
  const apps = await (await appsLoaded).json();
  studioCookies = await page.context().cookies();
  await expect(
    page
      .getByRole("button", { name: "Create app", exact: true })
      .or(page.getByRole("button", { name: "Create your first app" }))
      .first(),
  ).toBeVisible();
  if (apps.length) await nativeReady(page);
});
async function nativeReady(page) {
  await expect(page.locator("iframe")).toHaveAttribute("data-ready", "true", {
    timeout: 45000,
  });
  await expect
    .poll(() => page.locator("[data-rendered-node]").count())
    .toBeGreaterThan(0);
}
async function createApp(page, name) {
  await page.getByRole("button", { name: "Create app", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByRole("dialog")
    .getByLabel("Starting template")
    .selectOption("starter");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create app", exact: true })
    .click();
  await expect(
    page.locator(".project-selector select option:checked"),
  ).toHaveText(name);
  await expect(page.getByRole("dialog")).toBeHidden();
  await nativeReady(page);
}
async function draft(page, local = false) {
  const id = await page.locator(".project-selector select").inputValue();
  const saved = await (await page.request.get(`/api/apps/${id}`)).json();
  if (local && page.studioDocument)
    saved.draft = structuredClone(page.studioDocument);
  return saved;
}
async function replaceDraft(page, transform) {
  const saved = await draft(page),
    me = await (await page.request.get("/api/me")).json();
  transform(saved.draft);
  const r = await page.request.put(`/api/apps/${saved.id}/draft`, {
    headers: { "x-csrf-token": me.csrf },
    data: { revision: saved.revision, document: saved.draft },
  });
  expect(r.status(), await r.text()).toBe(200);
  await page.reload();
  await nativeReady(page);
  return saved;
}
async function selectLayer(page, id) {
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.locator(`[data-node-id="${id}"]`).click();
}
async function clickNode(page, id, xFraction = 0.5) {
  await nativeReady(page);
  const box = page.locator(`[data-rendered-node="${id}"]`).first();
  await expect(box).toHaveCount(1);
  const b = await box.evaluate((el) =>
    Object.fromEntries(
      ["x", "y", "width", "height"].map((k) => [k, Number(el.dataset[k])]),
    ),
  );
  const board = await page.locator(".flutter-artboard").boundingBox(),
    width = await page
      .locator(".flutter-artboard")
      .evaluate((el) => el.offsetWidth),
    scale = board.width / width;
  await page.mouse.click(
    board.x + (b.x + b.width * xFraction) * scale,
    board.y + (b.y + b.height / 2) * scale,
  );
}
async function interact(page) {
  await page
    .locator(".flutter-edit-overlay")
    .dblclick({ position: { x: 5, y: 5 } });
  await expect(page.locator(".flutter-edit-overlay")).toHaveCount(0);
}
async function insert(page, query, label) {
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page.getByLabel("Find widget").fill(query);
  await page
    .locator(".insert-with-layers")
    .getByRole("option", { name: label, exact: true })
    .click();
}
async function chooseChild(page, label, query, name) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: `${label} picker`,
    exact: true,
  });
  await picker.getByRole("combobox").fill(query);
  await picker.getByRole("option", { name, exact: true }).click();
}

test("Flutter-only editing, reusable components, publishing and runtime keys work end to end", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createApp(page, "Everyday Studio");
  expect(
    await page.getByRole("button", { name: "Appearance", exact: true }).count(),
  ).toBe(0);
  const original = await draft(page, true),
    heading = nodes(original.draft.screens[0].tree).find(
      (n) => n.text === "Your daily edit",
    );
  await clickNode(page, heading.id);
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Your daily edit",
  );
  await page
    .getByLabel("Text", { exact: true })
    .fill("Your everyday, reimagined");
  await page
    .getByRole("button", { name: "Create screen", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Settings");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create screen", exact: true })
    .click();
  await insert(page, "text", "Text");
  await page.getByLabel("Text", { exact: true }).fill("A shared heading");
  await page
    .getByRole("button", { name: "Create component", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Shared heading");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create component", exact: true })
    .click();
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page
    .locator(".entity-list button")
    .filter({ hasText: "Shared heading" })
    .click();
  await page.locator(".layer-tree .layer").first().click();
  await page.getByLabel("Text", { exact: true }).fill("{{props.title}}");
  await page
    .locator(".entity-list button")
    .filter({ hasText: "Shared heading" })
    .click();
  await page
    .getByLabel("New component property", { exact: true })
    .fill("title");
  await page.getByRole("button", { name: "Add property", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Shared across screens");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Shared across screens",
  );
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page.locator(".entity-list button").filter({ hasText: "Main" }).click();
  await insert(page, "shared heading", "Shared heading");
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
  await nativeReady(page);
  await page.screenshot({
    path: "test-results/studio-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "App settings", exact: true }).click();
  await page
    .locator(".settings-tabs")
    .getByRole("button", { name: "Connect app", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create API key", exact: true })
    .click();
  const key = await page.locator(".secret-key code").innerText(),
    start = await page.request.get("/runtime/start", {
      headers: { "x-space-api-key": key },
    });
  expect(start.status()).toBe(200);
  const document = await start.json();
  expect(JSON.stringify(document)).toContain("Shared across screens");
  expect(JSON.stringify(document)).toContain("Your everyday, reimagined");
  expect(document.state.products).toHaveLength(3);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Releases", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Version 1/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("searchable forms and bottom navigation items render, publish and navigate in the interactive preview", async ({
  page,
}) => {
  await createApp(page, "Customizable application");
  await insert(page, "form", "Form");
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await chooseChild(page, "Field type", "drop down", "Dropdown");
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  const rows = page.locator('[data-slot="children"] .child-row');
  await expect(rows).toHaveCount(2);
  await rows.first().locator(".child-select").click();
  await page.getByLabel("Label", { exact: true }).fill("Full name");
  await page.getByLabel("Required", { exact: true }).selectOption("true");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page
    .locator(".layer-tree .layer")
    .filter({ hasText: "Dropdown" })
    .last()
    .click();
  await page.getByRole("button", { name: "Add option", exact: true }).click();
  await page.getByLabel("Entry 3 label", { exact: true }).fill("Premium");
  await insert(page, "bottom navigation", "Bottom Navigation Bar");
  await page
    .getByRole("button", { name: "Add navigation item", exact: true })
    .click();
  await page.getByLabel("Item 3 label", { exact: true }).fill("Account");
  await page.getByLabel("Item 3 icon", { exact: true }).fill("person");
  await page
    .getByLabel("Item 3 screen", { exact: true })
    .selectOption("profile");
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
  const saved = await draft(page),
    screen = saved.draft.screens.find((s) => s.id === "main");
  expect(screen.tree.bottomNavigationBar.destinations).toHaveLength(3);
  expect(screen.tree.bottomNavigationBar.destinations[2].action.source).toBe(
    "/runtime/screens/profile",
  );
  await nativeReady(page);
  await interact(page);
  await clickNode(page, screen.tree.bottomNavigationBar.id, 5 / 6);
  await expect(page.locator(".artboard-label")).toContainText(
    "Running /profile",
  );
  await page.getByRole("button", { name: "Select tool", exact: true }).click();
  await expect(page.locator(".artboard-label")).toContainText("Main");
});

test("all catalog widgets have contextual controls and the latest component preview wins", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createApp(page, "Catalog inspection");
  await replaceDraft(page, (doc) =>
    doc.components.push(
      ...widgetTypes.map((type) => ({
        id: `catalog-${type.toLowerCase()}`,
        name: `Catalog ${type}`,
        defaults: {},
        tree: widget(type),
      })),
    ),
  );
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  for (const type of widgetTypes) {
    await page
      .getByRole("button", { name: `Catalog ${type}`, exact: true })
      .click();
    await page.locator(".layer-tree .layer").first().click();
    await page
      .getByRole("button", { name: "Technical properties…", exact: true })
      .click();
    await expect(page.locator(".inspector-node-type")).toContainText(type);
    expect(
      await page
        .locator(
          ".widget-properties [data-property],.widget-properties [data-slot],.widget-properties [data-collection]",
        )
        .count(),
      type,
    ).toBeGreaterThan(0);
  }
  await page.getByRole("button", { name: "Catalog text", exact: true }).click();
  await nativeReady(page);
  const latest = await page.evaluate(() =>
    window.previewMessages
      .filter((m) => m.type === "spacewidget-preview-rendered")
      .at(-1),
  );
  const geometry = await page.evaluate(() =>
    window.previewMessages
      .filter((m) => m.type === "spacewidget-preview-geometry")
      .at(-1),
  );
  expect(geometry.revision).toBe(latest.revision);
  expect(geometry.nodes.some((n) => n.widgetType === "text")).toBe(true);
  expect(errors).toEqual([]);
});

test("imported props and style stay editable through actual Flutter updates", async ({
  page,
}) => {
  await createApp(page, "Imported properties");
  await replaceDraft(page, (doc) => {
    doc.screens[0].tree = {
      type: "scaffold",
      body: {
        type: "center",
        child: {
          widgetType: "text",
          id: "legacy-text",
          style: { color: "red", fontSize: 12 },
          props: { text: "Imported label", fontSize: 20 },
        },
      },
    };
  });
  await clickNode(page, "legacy-text");
  await page
    .getByLabel("Text", { exact: true })
    .fill("Updated through inspector");
  await page.getByLabel("Font Size", { exact: true }).fill("26");
  await page.getByLabel("Color", { exact: true }).fill("blue");
  await nativeReady(page);
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await nativeReady(page);
  await clickNode(page, "legacy-text");
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Updated through inspector",
  );
  await expect(page.getByLabel("Font Size", { exact: true })).toHaveValue("26");
  await expect(page.getByLabel("Color", { exact: true })).toHaveValue("blue");
  await page.getByLabel("Preview device").selectOption("desktop");
  await expect
    .poll(async () =>
      Number(
        await page
          .locator('[data-rendered-node="legacy-text"]')
          .first()
          .getAttribute("data-x"),
      ),
    )
    .toBeGreaterThan(200);
  await clickNode(page, "legacy-text");
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Updated through inspector",
  );
});

test("product grid has typed component controls, source selection and device sizes", async ({
  page,
}) => {
  await createApp(page, "Product grid shop");
  await replaceDraft(page, (doc) => Object.assign(doc, addProductGrid(doc)));
  await page.getByRole("button", { name: "Components", exact: true }).click();
  await page.getByRole("button", { name: "Product grid", exact: true }).click();
  await page.getByLabel("Currency", { exact: true }).fill("INR");
  await nativeReady(page);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page.getByRole("button", { name: "Main", exact: true }).click();
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
  await nativeReady(page);
  await page.screenshot({
    path: "test-results/product-grid-flutter.png",
    fullPage: true,
  });
  await page.getByLabel("Preview device").selectOption("desktop");
  await expect(page.locator(".flutter-artboard")).toHaveCSS("width", "1280px");
  await expect(page.locator(".artboard-label")).toContainText("1280 × 800");
  const saved = await draft(page);
  expect(
    saved.draft.components.find((c) => c.id === "product-grid").defaults
      .currency,
  ).toBe("INR");
});

test("child picker searches components with keyboard selection and panels resize", async ({
  page,
}) => {
  await createApp(page, "Search and layers");
  const saved = await draft(page, true),
    body = nodes(saved.draft.screens[0].tree).find(
      (n) => n.type === "listView",
    );
  await selectLayer(page, body.id);
  await page
    .getByRole("button", { name: "Children widget type", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Children widget type picker",
  });
  await picker.getByRole("combobox").fill("welcome card");
  await picker.getByRole("combobox").press("Enter");
  await page
    .getByRole("button", { name: "Add children widget", exact: true })
    .click();
  await expect(
    page.locator('[data-slot="children"] .child-row').last(),
  ).toContainText("component");
  await page
    .locator('[data-slot="children"] .child-row')
    .last()
    .getByRole("button", { name: /Move .* up/ })
    .click();
  const before = await page.locator(".left-panel").boundingBox();
  await page.getByRole("separator", { name: "Resize layers panel" }).focus();
  await page.keyboard.press("ArrowRight");
  const after = await page.locator(".left-panel").boundingBox();
  expect(after.width).toBe(before.width + 16);
  await page.getByRole("button", { name: "Toggle properties panel" }).click();
  await expect(page.locator(".inspector")).toBeHidden();
  await page.getByRole("button", { name: "Toggle properties panel" }).click();
  await expect(page.locator(".inspector")).toBeVisible();
});

test("Interactive preview preserves input during property edits and supports reset", async ({
  page,
}) => {
  await createApp(page, "State preservation");
  await replaceDraft(page, (doc) => {
    doc.screens[0].tree = {
      type: "scaffold",
      id: "screen",
      body: {
        type: "column",
        id: "column",
        children: [
          { type: "input", id: "email-field", name: "email", label: "Email" },
          { type: "text", id: "label", text: "Before" },
        ],
      },
    };
  });
  await interact(page);
  await clickNode(page, "email-field");
  await page.keyboard.type("hello@example.com");
  const input = page.frameLocator("iframe").locator("input,textarea").last();
  await expect(input).toHaveValue("hello@example.com");
  await page.getByRole("button", { name: "Select tool" }).click();
  await selectLayer(page, "label");
  await page.getByLabel("Text", { exact: true }).fill("After");
  await nativeReady(page);
  await interact(page);
  await clickNode(page, "email-field");
  await expect(input).toHaveValue("hello@example.com");
  await page.getByRole("button", { name: "Reset preview state" }).click();
  await nativeReady(page);
  await clickNode(page, "email-field");
  await expect(input).toHaveValue("");
});
test("database field selection, request filters and data bindings persist through the editor", async ({
  page,
}) => {
  await createApp(page, "Data workspace");
  await page.getByLabel("New screen parameter", { exact: true }).fill("q");
  await page
    .getByRole("button", { name: "Add parameter", exact: true })
    .click();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.locator(".database-details > summary").click();
  await expect(page.locator(".schema-columns")).toContainText("user_id");
  await page
    .getByRole("button", { name: "Add data source", exact: true })
    .click();
  await page.getByLabel("Table", { exact: true }).selectOption("products");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("name", { exact: true }).check();
  await page.getByLabel("id", { exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Data binding name").fill("catalog");
  await page.getByRole("button", { name: "Add filter" }).click();
  await page.getByLabel("Filter column").selectOption("name");
  await page.getByLabel("Filter operator").selectOption("contains");
  await page.getByLabel("Filter value source").selectOption("query");
  await page.getByLabel("Filter value", { exact: true }).selectOption("q");
  await page.getByLabel("Optional", { exact: true }).check();
  await page
    .getByRole("button", { name: "Connect data source", exact: true })
    .click();
  await expect(
    page.locator(".resource-card").filter({ hasText: "catalog" }),
  ).toBeVisible();
  await page
    .locator(".resource-card")
    .filter({ hasText: "catalog" })
    .getByRole("button", { name: "Insert list" })
    .click();
  await nativeReady(page);
  // Flutter can own keyboard focus after mounting. Saving must still reach
  // Studio rather than the iframe's browser document.
  await page
    .frameLocator("iframe")
    .locator("body")
    .evaluate((body) => {
      body.tabIndex = 0;
      body.focus();
    });
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .locator(".resource-card")
    .filter({ hasText: "catalog" })
    .getByRole("button", { name: "Preview data", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Canvas sample data updated",
  );
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
});

test("late preview responses never overwrite a newer edit", async ({
  page,
}) => {
  await createApp(page, "Preview ordering");
  const saved = await draft(page, true),
    heading = nodes(saved.draft.screens[0].tree).find(
      (n) => n.text === "Your daily edit",
    );
  await selectLayer(page, heading.id);
  let release, started;
  const waiting = new Promise((resolve) => {
      release = resolve;
    }),
    observed = new Promise((resolve) => {
      started = resolve;
    });
  await page.route("**/api/apps/*/preview", async (route) => {
    if (
      JSON.stringify(route.request().postDataJSON()).includes(
        "Slow preview response",
      )
    ) {
      const response = await route.fetch();
      started();
      await waiting;
      try {
        await route.fulfill({ response });
      } catch {
        /* Superseded fetch was cancelled. */
      }
    } else await route.continue();
  });
  await page.getByLabel("Text", { exact: true }).fill("Slow preview response");
  await observed;
  await page
    .getByLabel("Text", { exact: true })
    .fill("Latest preview response");
  await nativeReady(page);
  const revision = await page.evaluate(
    () =>
      window.previewMessages
        .filter((m) => m.type === "spacewidget-preview-rendered")
        .at(-1).revision,
  );
  release();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () =>
        window.previewMessages
          .filter((m) => m.type === "spacewidget-preview-rendered")
          .at(-1).revision,
    ),
  ).toBe(revision);
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Latest preview response",
  );
});

test("missing Flutter assets show recovery instead of nesting Studio inside the preview", async ({
  page,
}) => {
  await createApp(page, "Preview recovery");
  const path = "**/flutter-preview/flutter_bootstrap.js?*";
  await page.route(path, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html>Studio editor</html>",
    }),
  );
  await page.getByRole("button", { name: "Reload Flutter preview" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Flutter preview assets are unavailable",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.unroute(path);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await nativeReady(page);
});

test("constrained canvas resize and layer drag preserve editable Flutter layout", async ({
  page,
}) => {
  await createApp(page, "Direct editing");
  await replaceDraft(page, (doc) => {
    doc.screens[0].tree = {
      type: "scaffold",
      id: "screen",
      body: {
        type: "column",
        id: "root-layout",
        crossAxisAlignment: "start",
        children: [
          {
            type: "container",
            id: "box",
            width: 120,
            height: 100,
            backgroundColor: "#dbeafe",
            child: { type: "text", id: "source", text: "Resize" },
          },
          {
            type: "column",
            id: "target",
            children: [
              { type: "text", id: "target-label", text: "Target layout" },
            ],
          },
        ],
      },
    };
  });
  await selectLayer(page, "box");
  const resizeHandle = page
    .getByRole("button", { name: "Resize selected widget" })
    .first();
  await resizeHandle.hover();
  const handle = await resizeHandle.boundingBox();
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handle.x + 35, handle.y + 25, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Width", { exact: true }).inputValue()),
    )
    .toBeGreaterThan(120);
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Height", { exact: true }).inputValue()),
    )
    .toBeGreaterThan(100);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("120");
  await page
    .locator('[data-node-id="source"]')
    .dragTo(page.locator('[data-node-id="target"]'));
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const saved = await draft(page),
    all = nodes(saved.draft.screens[0].tree);
  expect(
    all.find((n) => n.id === "target").children.some((n) => n.id === "source"),
  ).toBe(true);
  expect(all.find((n) => n.id === "box").child).toBeNull();
});

const figmaDesign = JSON.parse(
  readFileSync(new URL("../fixtures/figma-design.json", import.meta.url)),
);
async function pasteDesign(
  page,
  text = JSON.stringify(figmaDesign),
  html = "",
  target = "body",
) {
  return page.locator(target).evaluate(
    (el, { text, html }) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      if (html) clipboardData.setData("text/html", html);
      return !el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { text, html },
  );
}
async function reviewFigma(page) {
  await page.getByRole("button", { name: "Import Figma", exact: true }).click();
  await page.getByLabel("Figma export JSON").fill(JSON.stringify(figmaDesign));
}

test("Figma clipboard imports editable layers into a new screen, renders in Flutter and saves", async ({
  page,
}) => {
  await createApp(page, "Figma editable design");
  const before = await draft(page, true),
    savedBefore = await draft(page);
  expect(await pasteDesign(page)).toBe(true);
  await expect(
    page.getByRole("dialog", { name: "Import from Figma", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Imported design name")).toHaveValue(
    "Figma shop",
  );
  expect((await draft(page)).draft).toEqual(savedBefore.draft);
  await page.screenshot({
    path: "test-results/studio-figma-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Import design", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("Preview width")).toHaveValue("390");
  await expect(page.getByLabel("Preview height")).toHaveValue("300");
  await expect
    .poll(async () => JSON.stringify((await draft(page, true)).draft))
    .toContain("Shop from Figma");
  const imported = (await draft(page, true)).draft.screens.find(
    (s) => s.name === "Figma shop",
  );
  const heading = nodes(imported.tree).find((n) => n.labelName === "Heading");
  await expect(
    page.locator(`[data-rendered-node="${heading.id}"]`),
  ).toHaveCount(1);
  await clickNode(page, heading.id);
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Shop from Figma",
  );
  await page
    .getByLabel("Text", { exact: true })
    .fill("Edited after Figma import");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const saved = await draft(page);
  expect(JSON.stringify(saved.draft)).toContain("Edited after Figma import");
  expect(saved.draft.actions).toEqual(before.draft.actions);
  expect(saved.draft.screens[0]).toEqual(before.draft.screens[0]);
  await expect(page.getByText("Flutter live", { exact: true })).toBeVisible();
  await expect(page.locator(".canvas-footer .has-issues")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/studio-figma-import.png",
    fullPage: true,
  });
});

test("Figma snapshot components, explicit replacement and undo keep draft data", async ({
  page,
}) => {
  await createApp(page, "Figma import destinations");
  const before = await draft(page, true);
  await reviewFigma(page);
  await page.getByRole("radio", { name: /Visual snapshot/ }).check();
  await page.getByLabel("Figma import destination").selectOption("component");
  await page
    .getByRole("button", { name: "Import design", exact: true })
    .click();
  await expect
    .poll(async () => (await draft(page, true)).draft.components.length)
    .toBe(before.draft.components.length + 1);
  const component = (await draft(page, true)).draft.components.find(
    (c) => c.name === "Figma shop",
  );
  expect(nodes(component.tree).filter((n) => n.type === "image")).toHaveLength(
    1,
  );
  expect(nodes(component.tree).filter((n) => n.type === "text")).toHaveLength(
    0,
  );
  await expect(
    page.locator(`[data-rendered-node="${component.tree.id}"]`),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await draft(page, true)).draft.components.length)
    .toBe(before.draft.components.length);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page.locator(".entity-list button").filter({ hasText: "Main" }).click();
  await reviewFigma(page);
  await page.getByLabel("Figma import destination").selectOption("replace");
  await expect(page.locator(".figma-replace-note")).toContainText(
    "Undo restores",
  );
  await page
    .getByRole("button", { name: "Import design", exact: true })
    .click();
  await expect
    .poll(async () =>
      JSON.stringify((await draft(page, true)).draft.screens[0].tree),
    )
    .toContain("Shop from Figma");
  expect((await draft(page, true)).draft.screens[0].queries).toEqual(
    before.draft.screens[0].queries,
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await draft(page, true)).draft.screens[0])
    .toEqual(before.draft.screens[0]);
});

test("Figma paste respects text editors, explains native clipboard, validates exports and accepts PNG files", async ({
  page,
}) => {
  await createApp(page, "Figma clipboard boundaries");
  expect(await pasteDesign(page, "ordinary text")).toBe(false);
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  expect(
    await pasteDesign(
      page,
      JSON.stringify(figmaDesign),
      "",
      '[aria-label="Find widget"]',
    ),
  ).toBe(false);
  await expect(
    page.getByRole("dialog", { name: "Import from Figma", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(
    await pasteDesign(
      page,
      "Figma selection",
      "<!--(figmeta)private(/figmeta)--><!--(figma)private(/figma)-->",
    ),
  ).toBe(true);
  await expect(page.locator(".figma-native-notice")).toContainText(
    "Figma clipboard detected",
  );
  await expect(
    page.getByRole("button", { name: "Import design", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Figma export JSON")
    .fill('{"format":"spacewidget-figma","version":99}');
  await expect(page.getByRole("alert")).toContainText("not a supported");
  await expect(
    page.getByRole("button", { name: "Import design", exact: true }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download Figma plugin" }).click();
  expect((await download).suggestedFilename()).toBe(
    "spacewidget-figma-plugin.zip",
  );
  await page.getByLabel("Figma export file").setInputFiles({
    name: "Figma snapshot.png",
    mimeType: "image/png",
    buffer: Buffer.from(figmaDesign.frames[0].preview.split(",")[1], "base64"),
  });
  await expect(
    page.getByRole("radio", { name: /Visual snapshot/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: /Editable layers/ }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Import design", exact: true })
    .click();
  await expect(page.getByLabel("Preview width")).toHaveValue("4");
  await expect(page.getByLabel("Preview height")).toHaveValue("4");
  await expect
    .poll(async () => JSON.stringify((await draft(page, true)).draft.screens))
    .toContain("Figma snapshot");
  await nativeReady(page);
});

test("designer sidebar connects current-item fields without JSON and inserts a guided grid", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createApp(page, "Designer collections");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const source = page.locator(".resource-card").filter({ hasText: "products" });
  await source
    .getByRole("button", { name: "Build list or grid", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Choose what appears");
  await page.getByLabel("Item title field").selectOption("name");
  await page
    .getByRole("button", { name: "Add grid to screen", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Content", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByLabel("Repeated collection", { exact: true }),
  ).toHaveValue("products");
  await page.getByRole("button", { name: "Load records", exact: true }).click();
  await expect(page.locator(".toast[role=status]")).toContainText(
    "3 record(s) loaded",
  );
  await page
    .getByRole("button", { name: "Edit item design", exact: true })
    .click();
  const doc = (await draft(page, true)).draft;
  const repeat = nodes(doc.screens[0].tree).find(
    (n) => n.labelName === "Products grid",
  );
  const text = nodes(repeat.template).find(
    (n) => n.type === "text" && n.text === "{{item.name}}",
  );
  await selectLayer(page, text.id);
  await expect(page.locator(".context-note")).toContainText("Current item");
  await page.getByLabel("Search data fields").fill("category");
  await page.getByRole("button", { name: /Current item · Category/ }).click();
  await expect(page.locator(".connected-value")).toContainText("item.category");
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "{{item.category}}",
  );
  await expect(page.getByLabel("Literal", { exact: true })).toHaveCount(0);
  await expect(page.locator(".property-json")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Connect Text to data", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Content", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const saved = (await draft(page)).draft;
  expect(
    nodes(saved.screens[0].tree).find((n) => n.id === text.id).literal,
  ).toBe(false);
  await expect(page.getByText("Flutter live", { exact: true })).toBeVisible();
  await expect(page.locator(".canvas-footer .has-issues")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/designer-data.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("published comparison shows the live release without replacing or editing the draft", async ({
  page,
}) => {
  await createApp(page, "Release comparison");
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
  const before = await draft(page, true),
    heading = nodes(before.draft.screens[0].tree).find(
      (n) => n.text === "Your daily edit",
    );
  await clickNode(page, heading.id);
  await page.getByLabel("Text", { exact: true }).fill("Only in the draft");
  await page.getByRole("button", { name: /Published app v1/ }).click();
  await expect(page.locator(".preview-version-help")).toContainText(
    "Read-only",
  );
  await expect(page.getByLabel("Preview data source")).toHaveValue("database");
  await expect(
    page.getByRole("button", { name: "Back to editing", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Flutter live", { exact: true })).toBeVisible();
  await expect.poll(() => page.studioDocument?.screens[0].tree).not.toBeNull();
  const saved = await draft(page);
  expect(JSON.stringify(saved.draft)).not.toContain("Only in the draft");
  await page
    .getByRole("button", { name: "Back to editing", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Draft r/ }).first(),
  ).toHaveAttribute("aria-pressed", "true");
  await selectLayer(page, heading.id);
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Only in the draft",
  );
  await expect(page.getByText("Flutter live", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/designer-inspector.png",
    fullPage: true,
  });
});

test("designer inspector stays usable at a narrow desktop width", async ({
  page,
}) => {
  await createApp(page, "Narrow designer workspace");
  const doc = (await draft(page, true)).draft;
  const text = nodes(doc.screens[0].tree).find(
    (n) => n.text === "Your daily edit",
  );
  await selectLayer(page, text.id);
  await page.setViewportSize({ width: 1080, height: 900 });
  await expect(
    page.getByRole("tab", { name: "Appearance", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Text", { exact: true })).toHaveValue(
    "Your daily edit",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const canvas = await page.locator(".canvas-workspace").boundingBox(),
    sidebar = await page.locator(".inspector").boundingBox();
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(sidebar.x + 1);
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await expect(
    page.getByLabel("Target property", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.screenshot({
    path: "test-results/designer-narrow.png",
    fullPage: true,
  });
});

test("duplicate, searchable wrap/replace, icon conversion and palette drops preserve the tree", async ({
  page,
}) => {
  await createApp(page, "Structural editing");
  await replaceDraft(page, (doc) => {
    doc.screens[0].tree = {
      type: "scaffold",
      id: "screen",
      body: {
        type: "listView",
        id: "list",
        children: [
          {
            type: "container",
            id: "card",
            child: { type: "text", id: "copy-text", text: "Preserved text" },
          },
          {
            type: "icon",
            id: "convert-icon",
            name: "favorite",
            size: 32,
            color: "@theme.primary",
          },
          {
            type: "listView",
            id: "destination",
            shrinkWrap: true,
            children: [],
          },
        ],
      },
    };
  });
  await selectLayer(page, "copy-text");
  await page
    .getByRole("button", { name: "Duplicate widget", exact: true })
    .click();
  await nativeReady(page);
  await expect
    .poll(
      async () =>
        nodes((await draft(page, true)).draft.screens[0].tree).find(
          (n) => n.id === "card",
        ).child.type,
    )
    .toBe("column");
  let doc = (await draft(page, true)).draft;
  expect(
    nodes(doc.screens[0].tree)
      .find((n) => n.id === "card")
      .child.children.map((n) => n.text),
  ).toEqual(["Preserved text", "Preserved text"]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await selectLayer(page, "card");
  await page.getByRole("button", { name: "Wrap with…", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("padding");
  await dialog.getByRole("option", { name: "Padding", exact: true }).click();
  await nativeReady(page);
  await expect
    .poll(
      async () =>
        (await draft(page, true)).draft.screens[0].tree.body.children[0].type,
    )
    .toBe("padding");
  doc = (await draft(page, true)).draft;
  expect(doc.screens[0].tree.body.children[0].type).toBe("padding");
  expect(doc.screens[0].tree.body.children[0].child.id).toBe("card");
  await selectLayer(page, "convert-icon");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "favorite",
  );
  await page
    .getByRole("button", { name: "Replace widget…", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("icon button");
  await dialog
    .getByRole("option", { name: "Icon Button", exact: true })
    .click();
  await nativeReady(page);
  await expect
    .poll(
      async () =>
        nodes((await draft(page, true)).draft.screens[0].tree).find(
          (n) => n.id === "convert-icon",
        ).type,
    )
    .toBe("iconButton");
  doc = (await draft(page, true)).draft;
  const icon = nodes(doc.screens[0].tree).find((n) => n.id === "convert-icon");
  expect(icon).toMatchObject({
    type: "iconButton",
    icon: "favorite",
    iconSize: 32,
    iconColor: "@theme.primary",
  });
  const target = page.locator('[data-node-id="destination"]');
  await page.getByRole("button", { name: "Add widget", exact: true }).click();
  await page.getByLabel("Find widget").fill("text");
  await page.getByRole("option", { name: "Text", exact: true }).dragTo(target);

  await expect
    .poll(
      async () =>
        nodes((await draft(page, true)).draft.screens[0].tree).find(
          (n) => n.id === "destination",
        ).children.length,
    )
    .toBe(1);
  await nativeReady(page);
  await expect(
    page.getByRole("button", { name: "Run preview", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hand tool", exact: true }),
  ).toHaveCount(0);
});

test("app theme colors, custom fonts and appearance persist and match published preview", async ({
  page,
}) => {
  await createApp(page, "Theme parity");
  await page.getByRole("button", { name: "App theme", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Primary", { exact: true }).fill("#0066ff");
  await dialog.getByLabel("Secondary", { exact: true }).fill("#ff8800");
  await dialog
    .getByLabel("Scaffold background", { exact: true })
    .fill("#f0f1f2");
  await dialog
    .getByLabel("Font family", { exact: true })
    .fill("UploadedStudioFont");
  await dialog
    .getByLabel("Add custom font files", { exact: true })
    .setInputFiles(
      new URL(
        "../../preview/assets/fonts/StudioSans-Regular.ttf",
        import.meta.url,
      ).pathname,
    );
  await expect(dialog).toContainText(
    "UploadedStudioFont · StudioSans-Regular.ttf",
  );
  await dialog.getByLabel("Body font size", { exact: true }).fill("16");
  await dialog.getByLabel("Corner radius", { exact: true }).fill("12");
  await page.screenshot({
    path: "test-results/studio-theme-settings.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Apply theme to draft", exact: true })
    .click();
  await nativeReady(page);
  await expect
    .poll(async () => (await draft(page, true)).draft.theme.primaryColor)
    .toBe("#0066ff");
  expect((await draft(page, true)).draft.theme).toMatchObject({
    primaryColor: "#0066ff",
    secondaryColor: "#ff8800",
    backgroundColor: "#f0f1f2",
    fontFamily: "UploadedStudioFont",
    fontSize: 16,
    borderRadius: 12,
  });
  expect((await draft(page, true)).draft.theme.fonts).toHaveLength(1);
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
  await page
    .getByRole("button", { name: "Published app", exact: false })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("data-ready", "true");
  expect(page.studioDocument.theme.primaryColor).toBe("#0066ff");
  await page.getByRole("button", { name: /Draft r/ }).click();
  await page.getByRole("button", { name: "App theme", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Primary", { exact: true }).fill("#ff8800");
  await dialog
    .getByRole("button", { name: "Apply theme to draft", exact: true })
    .click();
  await nativeReady(page);
  await expect
    .poll(() => page.studioDocument.theme.primaryColor)
    .toBe("#ff8800");
  await page
    .getByRole("button", { name: "Published app", exact: false })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("data-ready", "true");
  // Parent-to-frame messages aren't in window's receive list; inspect the actual published API response.
  const id = await page.locator(".project-selector select").inputValue();
  const published = await (
    await page.request.post(`/api/apps/${id}/preview`, {
      headers: {
        "x-csrf-token": (await (await page.request.get("/api/me")).json()).csrf,
      },
      data: { source: "published", screenId: "main" },
    })
  ).json();
  expect(published.theme.primaryColor).toBe("#0066ff");
});

test("uploaded images render and pull-to-refresh reloads the initial Flutter preview", async ({
  page,
}) => {
  await createApp(page, "Image and refresh");
  await replaceDraft(page, (doc) => {
    doc.screens[0].tree = {
      type: "scaffold",
      id: "screen",
      body: {
        type: "refreshIndicator",
        id: "refresh",
        onRefresh: { type: "refresh" },
        child: {
          type: "listView",
          id: "scroll",
          children: [
            { type: "image", id: "image", src: "", height: 100, width: 100 },
            { type: "text", id: "refresh-label", text: "Pull to reload" },
          ],
        },
      },
    };
  });
  await selectLayer(page, "image");
  await page.getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGMQK3nxHxkzkC4AABc3JxECP3cJAAAAAElFTkSuQmCC",
      "base64",
    ),
  });
  await expect(page.getByAltText("Image source preview")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("Image source preview")
        .evaluate((img) => img.naturalWidth),
    )
    .toBe(4);
  const imageServer = createImageServer((req, res) => {
    res.writeHead(200, {
      "content-type": "image/png",
      "access-control-allow-origin": "*",
    });
    res.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGMQK3nxHxkzkC4AABc3JxECP3cJAAAAAElFTkSuQmCC",
        "base64",
      ),
    );
  });
  await new Promise((resolve) => imageServer.listen(0, "127.0.0.1", resolve));
  try {
    await page
      .getByLabel("Media URL", { exact: true })
      .fill(`http://127.0.0.1:${imageServer.address().port}/image.png`);
    await expect
      .poll(() =>
        page
          .getByAltText("Image source preview")
          .evaluate((img) => img.naturalWidth),
      )
      .toBe(4);
    await nativeReady(page);
    await selectLayer(page, "refresh");
    await page.getByRole("tab", { name: "Interactions", exact: true }).click();
    await expect(page.getByLabel("On Refresh", { exact: true })).toHaveValue(
      "refresh",
    );
    await interact(page);
    const board = await page.locator("iframe").boundingBox();
    const refreshed = page.waitForResponse(
      (r) =>
        r.url().endsWith("/preview") &&
        r.request().postDataJSON()?.document &&
        r.request().postDataJSON()?.query,
    );
    await page.mouse.move(board.x + board.width * 0.5, board.y + 100);
    await page.mouse.down();
    await page.mouse.move(board.x + board.width * 0.5, board.y + 350, {
      steps: 15,
    });
    await page.mouse.up();
    expect((await refreshed).status()).toBe(200);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.previewMessages
            .filter((m) => m.type === "spacewidget-preview-error")
            .map((m) => m.message),
        ),
      )
      .toEqual([]);
  } finally {
    await new Promise((resolve) => imageServer.close(resolve));
  }
});

test("guided action controls create overlay content, sequences and validated integration submits", async ({
  page,
}) => {
  await createApp(page, "Guided interactions");
  await insert(page, "filled button", "Filled Button");
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  await page.getByLabel("On tap", { exact: true }).selectOption("bottomSheet");
  await expect(
    page.getByRole("button", { name: "Edit overlay content in Layers" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      nodes((await draft(page, true)).draft.screens[0].tree).some(
        (n) => n.type === "filledButton" && n.action?.type === "bottomSheet",
      ),
    )
    .toBe(true);
  let saved = await draft(page, true);
  let trigger = nodes(saved.draft.screens[0].tree).find(
    (n) => n.type === "filledButton" && n.action?.type === "bottomSheet",
  );
  expect(trigger.action.content.type).toBe("padding");
  await page
    .getByLabel("Save close result to", { exact: true })
    .fill("confirmed");
  await page.getByLabel("On tap", { exact: true }).selectOption("dialog");
  await expect(
    page.getByRole("button", { name: "Edit overlay content in Layers" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      nodes((await draft(page, true)).draft.screens[0].tree).some(
        (n) => n.type === "filledButton" && n.action?.type === "dialog",
      ),
    )
    .toBe(true);
  saved = await draft(page, true);
  trigger = nodes(saved.draft.screens[0].tree).find(
    (n) => n.type === "filledButton" && n.action?.type === "dialog",
  );
  expect(trigger.action.content.type).toBe("alertDialog");
  expect(trigger.action.content.actions[1].action.type).toBe("pop");
  await page.getByLabel("On tap", { exact: true }).selectOption("sequence");
  await page.getByRole("button", { name: "Add action step" }).click();
  await page.getByLabel("Step 2", { exact: true }).selectOption("refresh");
  await expect(page.getByLabel("Step 2", { exact: true })).toHaveValue(
    "refresh",
  );
  await page.getByLabel("On tap", { exact: true }).selectOption("submit");
  await page
    .getByLabel("Submit to", { exact: true })
    .selectOption("integration");
  await expect(
    page.getByLabel("Integration name", { exact: true }),
  ).toHaveValue("authLogin");
  await page
    .getByLabel("Form to validate", { exact: true })
    .fill("customer-form");
  await expect
    .poll(async () =>
      nodes((await draft(page, true)).draft.screens[0].tree).some(
        (n) =>
          n.type === "filledButton" &&
          n.action?.operation === "authLogin" &&
          n.action.form === "customer-form",
      ),
    )
    .toBe(true);
  saved = await draft(page, true);
  trigger = nodes(saved.draft.screens[0].tree).find(
    (n) => n.type === "filledButton" && n.action?.operation === "authLogin",
  );
  expect(trigger.action.form).toBe("customer-form");
  expect(trigger.action.source).toBeUndefined();
});

test("AI design, custom code, API services and integration controls work through the Studio UI", async ({
  page,
}) => {
  await createApp(page, "Platform controls");
  await page.getByRole("button", { name: "AI design", exact: true }).click();
  await page
    .getByLabel("Model ID from your provider account")
    .fill("test-model");
  await page.getByLabel("AI provider API key").fill("test-ai-provider-key");
  await page
    .getByRole("button", { name: "Save AI settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generate design", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("AI provider API key")).toHaveValue("");
  await page.route("**/api/apps/*/ai/design", (route) =>
    route.fulfill({
      json: {
        target: "screen",
        name: "AI Learning",
        tree: {
          type: "scaffold",
          body: { type: "text", text: "Your next lesson" },
        },
        state: {},
        provider: "openai",
        model: "test-model",
      },
    }),
  );
  await page
    .getByLabel("Describe your design")
    .fill("Create a course dashboard");
  await page
    .getByRole("button", { name: "Generate design", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AI Learning", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply to draft", exact: true })
    .click();
  await nativeReady(page);
  await expect(
    page.locator(".layer-row").filter({ hasText: "Text" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "App settings", exact: true }).click();
  await page.getByRole("button", { name: "Custom code", exact: true }).click();
  await page.getByLabel("Module ID", { exact: true }).fill("calculate-total");
  await page
    .getByLabel("Code source", { exact: true })
    .fill("(context) => ({total: context.input.quantity * 42})");
  await page
    .getByRole("button", { name: "Save code draft", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable saved function", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Test input (JSON)").fill('{"quantity":2}');
  await page.getByRole("button", { name: "Test draft", exact: true }).click();
  await expect(page.locator(".platform-panel pre")).toContainText("84");
  await page
    .getByRole("button", { name: "Enable saved function", exact: true })
    .click();
  await expect(page.locator(".platform-panel")).toContainText("Enabled 1");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByRole("button", { name: "API connections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "API connections" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "App settings", exact: true }).click();
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "App integrations" }),
  ).toBeVisible();
  await expect(page.locator(".management-page")).toContainText("PostgreSQL");
  await expect(page.locator(".management-page")).toContainText("Apple sign-in");
  await expect(page.locator(".management-page")).toContainText("Razorpay");
  await page.getByLabel("Link name", { exact: true }).fill("Support");
  await page
    .getByLabel("Destination", { exact: true })
    .fill("https://example.com/support");
  await page
    .getByRole("button", { name: "Save app link", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Support", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Users & sign-in", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "App authentication", exact: true }),
  ).toBeVisible();
});

test("designer journey configures parameters, filters, field binding, opening events and one shared navigation layout", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await createApp(page, "Designer workflow");
  await page
    .getByRole("button", { name: "Create screen", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Details");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create screen", exact: true })
    .click();
  await page
    .getByLabel("New screen parameter", { exact: true })
    .fill("productId");
  await page
    .getByRole("button", { name: "Add parameter", exact: true })
    .click();
  await page
    .getByLabel("Preview example for productId", { exact: true })
    .fill("p2");
  await page.getByLabel("Required when opening", { exact: true }).check();
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await expect(page.getByLabel("Content for screen")).toHaveValue("details");
  await page
    .getByRole("button", { name: "Add data source", exact: true })
    .click();
  await page.getByLabel("Table", { exact: true }).selectOption("products");
  await page.getByRole("button", { name: /One record/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("id", { exact: true }).check();
  await page.getByLabel("name", { exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Data binding name").fill("product");
  await page.getByRole("button", { name: "Add filter", exact: true }).click();
  await page.getByLabel("Filter column").selectOption("id");
  await page.getByLabel("Filter value source").selectOption("query");
  await page
    .getByLabel("Filter value", { exact: true })
    .selectOption("productId");
  await page
    .getByRole("button", { name: "Connect data source", exact: true })
    .click();
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await insert(page, "text", "Text");
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByLabel("Search data fields").fill("Product · Name");
  await page.getByRole("button", { name: /Product · Name/ }).click();
  await page
    .locator(".entity-list button")
    .filter({ hasText: "Details" })
    .click();
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  await page
    .getByLabel("When screen opens", { exact: true })
    .selectOption("set");
  await page.getByLabel("State value path", { exact: true }).fill("opened");
  // The opening event uses the same sequencer as layer interactions.
  await page.locator(".entity-list button").filter({ hasText: "Main" }).click();
  await page
    .getByRole("button", {
      name: "Use this screen as navigation layout",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Remove tab", exact: true })
    .nth(1)
    .click();
  await page
    .getByRole("button", { name: "Remove tab", exact: true })
    .nth(1)
    .click();
  await expect(page.getByLabel("Tab 2 screen", { exact: true })).toHaveValue(
    "details",
  );
  await page
    .getByRole("button", { name: "Pass productId", exact: true })
    .click();
  await page.getByLabel("productId", { exact: true }).fill("p2");
  await page
    .getByRole("button", { name: "Publish Draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Version 1 is live");
  await page.getByRole("button", { name: "App settings", exact: true }).click();
  await page
    .locator(".settings-tabs")
    .getByRole("button", { name: "Connect app", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create API key", exact: true })
    .click();
  const key = await page.locator(".secret-key code").innerText();
  const response = await page.request.get(
    "/runtime/screens/details?productId=p2",
    { headers: { "x-space-api-key": key } },
  );
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.state.product.name).toBe("Everyday backpack");
  expect(result.state.params.productId).toBe("p2");
  expect(result.widgets.bottomNavigationBar.selectedIndex).toBe(1);
  expect(
    result.widgets.bottomNavigationBar.destinations.find(
      (d) => d.screenId === "details",
    ).action.query,
  ).toEqual({ productId: "p2" });
  expect(result.onLoad.path).toBe("opened");
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await page
    .locator(".entity-list button")
    .filter({ hasText: "Details" })
    .click();
  await nativeReady(page);
  await page.screenshot({
    path: "test-results/designer-screen-setup.png",
    fullPage: true,
  });
});

test("autosave survives reload and recovers a browser draft without overwriting newer server edits", async ({
  page,
}) => {
  await createApp(page, "Draft recovery");
  await page.getByLabel("Screen name", { exact: true }).fill("Autosaved home");
  await expect(page.locator(".save-status")).toContainText(/Draft r\d+ saved/);
  await page.reload();
  await nativeReady(page);
  await expect(page.getByLabel("Screen name", { exact: true })).toHaveValue(
    "Autosaved home",
  );
  const saved = await draft(page);
  saved.draft.screens[0].name = "Recovered home";
  await page.evaluate(
    ({ saved, email }) =>
      localStorage.setItem(
        `spacewidget:draft:${email}:${saved.id}`,
        JSON.stringify({ revision: saved.revision, document: saved.draft }),
      ),
    { saved, email: credentials.email },
  );
  await page.reload();
  await nativeReady(page);
  await expect(page.getByLabel("Screen name", { exact: true })).toHaveValue(
    "Recovered home",
  );
  await expect(page.locator(".save-status")).toContainText(/Draft r\d+ saved/);
  await page.reload();
  await nativeReady(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Screen name", { exact: true })).toHaveValue(
    "Recovered home",
  );
  const latest = await draft(page);
  const recovery = structuredClone(latest);
  recovery.draft.screens[0].name = "Stale browser copy";
  await page.evaluate(
    ({ recovery, email }) =>
      localStorage.setItem(
        `spacewidget:draft:${email}:${recovery.id}`,
        JSON.stringify({
          revision: recovery.revision - 1,
          document: recovery.draft,
        }),
      ),
    { recovery, email: credentials.email },
  );
  await page.reload();
  await nativeReady(page);
  await expect(page.getByRole("dialog")).toContainText("older server revision");
  expect((await draft(page)).draft.screens[0].name).toBe("Recovered home");
  await page
    .getByRole("button", { name: "Keep server draft", exact: true })
    .click();
});

test("blank apps and sample function content stay designer-friendly and provider settings have one home", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Create app", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Starting template"),
  ).toHaveValue("blank");
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Blank designer app");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create app", exact: true })
    .click();
  await expect(
    page.locator(".project-selector select option:checked"),
  ).toHaveText("Blank designer app");
  await expect(page.getByRole("dialog")).toBeHidden();
  await nativeReady(page);
  expect((await draft(page)).draft.screens[0].queries).toEqual([]);
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page
    .getByText("Preview content for function results", { exact: true })
    .click();
  await page.getByLabel("New preview field", { exact: true }).fill("welcome");
  await page
    .getByLabel("Preview field type", { exact: true })
    .selectOption("record");
  await page
    .getByRole("button", { name: "Add preview field", exact: true })
    .click();
  await page
    .getByLabel("New preview field in welcome", { exact: true })
    .fill("message");
  await page
    .getByRole("button", { name: "Add preview field", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Preview welcome.message", { exact: true })
    .fill("Welcome, Alex");
  await insert(page, "text", "Text");
  await page.getByRole("tab", { name: "Content", exact: true }).click();
  await page.getByLabel("Search data fields").fill("Welcome · Message");
  await page.getByRole("button", { name: /Welcome · Message/ }).click();
  await expect(page.locator(".connected-value")).toContainText(
    "welcome.message",
  );
  await page.getByRole("button", { name: "App settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "App authentication", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "App integrations", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "App integrations", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "API services", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Screens", exact: true }).click();
  await nativeReady(page);
  await page.screenshot({
    path: "test-results/designer-content-binding.png",
    fullPage: true,
  });
});

test("database operation inputs guide the form and its interaction without remembering filter names", async ({
  page,
}) => {
  await createApp(page, "Operation workflow");
  await page.getByRole("button", { name: "Interactions", exact: true }).click();
  await page
    .getByRole("button", { name: "Create action", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Operation name").fill("update-profile-name");
  await dialog.getByLabel("Table", { exact: true }).selectOption("profiles");
  await dialog.getByLabel("Allow name", { exact: true }).check();
  await dialog.getByLabel("Require name", { exact: true }).check();
  await expect(
    dialog.getByLabel("Filter 1 value", { exact: true }),
  ).toHaveValue("id");
  await dialog
    .getByRole("button", { name: "Create operation", exact: true })
    .click();
  const card = page.locator(".resource-card").filter({
    has: page.getByRole("heading", {
      name: "update-profile-name",
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Add form to screen", exact: true })
    .click();
  await nativeReady(page);
  await expect
    .poll(
      async () =>
        nodes((await draft(page, true)).draft.screens[0].tree).filter(
          (n) => n.type === "form",
        ).length,
    )
    .toBeGreaterThan(0);
  const local = (await draft(page, true)).draft;
  const form = nodes(local.screens[0].tree).find(
    (n) =>
      n.type === "form" &&
      nodes(n).some(
        (c) => c.action?.source === "/runtime/actions/update-profile-name",
      ),
  );
  expect(
    form.children
      .filter((n) => n.type === "input")
      .map((n) => n.name)
      .sort(),
  ).toEqual(["id", "name"]);
  const button = nodes(form).find((n) => n.type === "filledButton");
  await selectLayer(page, button.id);
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pass id", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pass name", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".mapping-editor").filter({
      has: page.getByRole("heading", { name: "Request data", exact: true }),
    }),
  ).toContainText("Submitted automatically");
  await page.screenshot({
    path: "test-results/designer-operation-inputs.png",
    fullPage: true,
  });
});

test("opening overlays can be styled in Flutter and extraction inside a component keeps the screen unchanged", async ({
  page,
}) => {
  test.setTimeout(120000);
  await createApp(page, "Overlay and extraction");
  await page.locator(".entity-list button").filter({ hasText: "Main" }).click();
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  await page
    .getByLabel("When screen opens", { exact: true })
    .selectOption("dialog");
  await page
    .getByRole("button", {
      name: "Edit overlay content in Layers",
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: "Appearance", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Opening offer");
  await expect(page.getByLabel("Text", { exact: true })).toHaveCount(0);
  await nativeReady(page);
  await expect
    .poll(async () => page.studioDocument?.screens[0]?.onLoad?.content?.title)
    .toBe("Opening offer");
  await expect
    .poll(() => page.locator("[data-rendered-node]").count())
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/designer-opening-overlay.png",
    fullPage: true,
  });
  await page.getByRole('tab',{name:'Content',exact:true}).click();
  await expect(page.getByLabel('Target property',{exact:true})).toHaveValue('title');
  await expect(page.getByLabel('Target property',{exact:true}).locator('option[value="text"]')).toHaveCount(0);
  const before = (await draft(page, true)).draft;
  await page.getByRole("button", { name: "Components", exact: true }).click();
  const main = before.components[0],
    child = nodes(main.tree).find((n) => n.type === "text");
  await selectLayer(page, child.id);
  await page
    .getByRole("button", { name: "Create component", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Reusable heading");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create component", exact: true })
    .click();
  await expect
    .poll(async () => (await draft(page, true)).draft.components.length)
    .toBe(before.components.length + 1);
  const after = (await draft(page, true)).draft;
  expect(after.screens).toEqual(before.screens);
  expect(
    nodes(after.components.find((c) => c.id === main.id).tree).some(
      (n) => n.componentId === "reusable-heading",
    ),
  ).toBe(true);
});

test("sign-in setup and OAuth actions use the chosen destination instead of an account screen assumption", async ({
  page,
}) => {
  await createApp(page, "Sign-in workflow");
  await page
    .locator(".entity-list button")
    .filter({ hasText: "Profile" })
    .click();
  await page
    .getByLabel("New screen parameter", { exact: true })
    .fill("section");
  await page
    .getByRole("button", { name: "Add parameter", exact: true })
    .click();
  await page
    .getByLabel("Default value for section", { exact: true })
    .fill("overview");
  await page.getByRole("button", { name: "App settings", exact: true }).click();
  await page
    .getByLabel("Destination for a new sign-in screen")
    .selectOption("profile");
  const destinationValues = page.locator(".mapping-editor").filter({
    has: page.getByRole("heading", {
      name: "New sign-in destination values",
      exact: true,
    }),
  });
  await destinationValues
    .getByRole("button", { name: "Pass section", exact: true })
    .click();
  await destinationValues
    .getByLabel("section", { exact: true })
    .fill("bookings");
  await page.getByLabel("Start the app here until the user signs in").check();
  await page
    .getByRole("button", { name: "Create sign-in screen", exact: true })
    .click();
  await expect.poll(() => page.studioDocument?.screens?.length).toBe(4);
  let local = (await draft(page, true)).draft;
  const signin = local.screens.find((s) => s.id === local.initialScreen);
  expect(signin.public).toBe(true);
  expect(signin.onLoad.then.source).toBe("/runtime/screens/profile");
  expect(signin.onLoad.then.query).toEqual({ section: "bookings" });
  expect(
    nodes(signin.tree).find((n) => n.type === "loginForm").onSuccess.source,
  ).toBe("/runtime/screens/profile");
  await insert(page, "filledButton", "Filled Button");
  await page.getByRole("tab", { name: "Interactions", exact: true }).click();
  await page.getByLabel("On tap", { exact: true }).selectOption("operation");
  await page
    .getByLabel("Integration name", { exact: true })
    .selectOption("authOAuth");
  await page
    .getByLabel("After OAuth returns", { exact: true })
    .selectOption("profile");
  await page.getByRole("button", { name: "Pass section", exact: true }).click();
  await page.getByLabel("section", { exact: true }).fill("bookings");
  await expect
    .poll(async () =>
      nodes(
        (await draft(page, true)).draft.screens.find((s) => s.id === signin.id)
          .tree,
      ).some(
        (n) =>
          n.action?.name === "authOAuth" &&
          n.action.data.screenId === "profile",
      ),
    )
    .toBe(true);
});

test("API endpoints accept test parameters, expose response samples and can be edited without losing the connection", async ({
  page,
}) => {
  test.setTimeout(120000);
  await createApp(page, "API workflow");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page
    .getByRole("button", { name: "API connections", exact: true })
    .click();
  await page.getByText("Add an HTTP service", { exact: true }).click();
  await page.getByLabel("HTTP service ID").fill("test-catalog");
  await page.getByLabel("API origin").fill("https://catalog.example.test");
  await page.getByLabel("Endpoint ID", { exact: true }).fill("browse");
  await page.getByLabel("Endpoint path", { exact: true }).fill("/products");
  await page.getByLabel("Allow public reads").check();
  await page
    .getByRole("button", { name: "Save API endpoint", exact: true })
    .click();
  await expect(page.getByLabel("Saved API endpoint")).toHaveValue(
    "test-catalog/browse",
  );
  await page
    .getByRole("button", { name: "Connect API to screen", exact: true })
    .click();
  const endpoint = page
    .locator(".api-endpoint-card")
    .filter({ has: page.getByText("browse", { exact: true }) });
  await endpoint.getByText("Test inputs for browse", { exact: true }).click();
  const mapping = endpoint.locator(".mapping-editor").filter({
    has: page.getByRole("heading", {
      name: "browse test query",
      exact: true,
    }),
  });
  await mapping.getByLabel("New browse test query field").fill("category");
  await mapping.getByRole("button", { name: "Add field", exact: true }).click();
  await mapping.getByLabel("category", { exact: true }).fill("home");
  await endpoint
    .getByRole("button", { name: "Test endpoint", exact: true })
    .click();
  await expect(page.locator(".http-services-panel pre")).toContainText(
    "Result home",
  );
  await page
    .getByRole("button", {
      name: "Use response as apiProducts sample",
      exact: true,
    })
    .click();
  await endpoint
    .getByRole("button", { name: "Edit endpoint", exact: true })
    .click();
  await expect(page.getByLabel("Endpoint path", { exact: true })).toHaveValue(
    "/products",
  );
  await page.getByLabel("Endpoint path", { exact: true }).fill("/catalog");
  await page
    .getByRole("button", { name: "Save API endpoint", exact: true })
    .click();
  await expect(endpoint).toContainText("GET /catalog");
  const id = await page.locator(".project-selector select").inputValue();
  const services = await (
    await page.request.get(`/api/apps/${id}/http-services`)
  ).json();
  expect(services[0].endpoints).toHaveLength(1);
  expect(services[0].endpoints[0].path).toBe("/catalog");
});
