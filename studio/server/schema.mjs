import { z } from "zod";
import { readFileSync } from "node:fs";
import { failure } from "./security.mjs";
import { validateNavigation } from "../shared/screens.mjs";
export const widgetTypes = JSON.parse(
  readFileSync(new URL("../shared/widget-types.json", import.meta.url)),
);
const slug = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const column = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/i);
const sourceValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z
    .object({
      from: z.enum(["auth", "query", "body"]),
      key: z.string().max(100),
    })
    .strict(),
]);
const filter = z
  .object({
    column,
    op: z.enum(["eq", "ne", "contains", "gt", "gte", "lt", "lte", "in"]),
    value: sourceValue,
    optional: z.boolean().default(false),
  })
  .strict();
const query = z
  .object({
    id: slug,
    connectionId: z.string(),
    table: column,
    select: z.array(column).min(1).max(40),
    scope: z.enum(["public", "user"]),
    ownerColumn: column.default("user_id"),
    filters: z.array(filter).max(20).default([]),
    orderBy: column.default("id"),
    direction: z.enum(["asc", "desc"]).default("asc"),
    limit: z.number().int().min(1).max(100).default(20),
    single: z.boolean().default(false),
  })
  .strict();
const field = z
  .object({
    column,
    type: z.enum(["string", "number", "integer", "boolean"]),
    required: z.boolean().default(false),
    maxLength: z.number().int().min(1).max(10000).default(1000),
  })
  .strict();
const themeColor = z.union([
  z.number().int().min(0).max(0xffffffff),
  z
    .string()
    .regex(
      /^(?:#[0-9a-f]{3}|#?(?:[0-9a-f]{6}|[0-9a-f]{8})|0x[0-9a-f]{8}|transparent|black|white|red|green|blue|grey|orange|purple|teal)$/i,
    ),
]);
const fontData = z
  .string()
  .max(3 * 1024 * 1024)
  .regex(/^data:[^,]*;base64,[A-Za-z0-9+/]+=*$/)
  .refine((value) => {
    const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
    return (
      bytes.length > 4 &&
      bytes.length <= 2 * 1024 * 1024 &&
      (bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) ||
        bytes.subarray(0, 4).toString() === "OTTO")
    );
  }, "Use a TTF or OTF font file under 2 MB.");
const appTheme = z
  .object({
    ...Object.fromEntries(
      "seedColor primaryColor secondaryColor onPrimaryColor onSecondaryColor backgroundColor surfaceColor onSurfaceColor errorColor onErrorColor"
        .split(" ")
        .map((key) => [key, themeColor.optional()]),
    ),
    fontFamily: z.string().max(100).optional(),
    fontSize: z.number().min(8).max(48).optional(),
    borderRadius: z.number().min(0).max(64).optional(),
    fonts: z
      .array(
        z
          .object({
            family: z.string().trim().min(1).max(100),
            name: z.string().max(200).optional(),
            data: fontData,
          })
          .strict(),
      )
      .max(12)
      .refine(
        (fonts) => JSON.stringify(fonts).length <= 6 * 1024 * 1024,
        "Combined fonts must be under 4 MB.",
      )
      .optional(),
  })
  .catchall(z.json());
export const definitionSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    initialScreen: slug,
    navigation: z.object({ screenId: slug }).strict().optional(),
    features: z
      .array(z.enum(["commerce"]))
      .max(1)
      .optional(),
    theme: appTheme.default({ seedColor: "#7763e8" }),
    themeMode: z.enum(["light", "dark", "system"]).default("light"),
    darkTheme: appTheme.optional(),
    screens: z
      .array(
        z
          .object({
            id: slug,
            name: z.string().min(1).max(100),
            public: z.boolean().default(false),
            previewData: z.record(z.string(), z.json()).optional(),
            parameters: z
              .record(
                z
                  .string()
                  .regex(
                    /^(?!__proto__$|constructor$|prototype$)[a-zA-Z_][a-zA-Z0-9_]{0,63}$/,
                  ),
                z
                  .object({
                    type: z
                      .enum(["string", "number", "integer", "boolean"])
                      .default("string"),
                    required: z.boolean().default(false),
                    description: z.string().max(300).optional(),
                    defaultValue: z
                      .union([z.string().max(2000), z.number(), z.boolean()])
                      .optional(),
                    sampleValue: z
                      .union([z.string().max(2000), z.number(), z.boolean()])
                      .optional(),
                  })
                  .strict(),
              )
              .optional(),
            onLoad: z.json().optional(),
            loader: z
              .enum(["catalog", "cart", "orders", "order", "notifications"])
              .optional(),
            state: z.record(z.string(), z.json()).default({}),
            queries: z.array(query).max(20).default([]),
            httpQueries: z
              .array(
                z
                  .object({
                    id: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/),
                    serviceId: slug,
                    endpointId: slug,
                    query: z.record(z.string(), sourceValue).default({}),
                  })
                  .strict(),
              )
              .max(10)
              .optional(),
            tree: z.record(z.string(), z.json()),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    components: z
      .array(
        z
          .object({
            id: slug,
            name: z.string().min(1).max(100),
            defaults: z.record(z.string(), z.json()).default({}),
            previewData: z.record(z.string(), z.json()).optional(),
            tree: z.record(z.string(), z.json()),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    actions: z
      .array(
        z
          .object({
            id: slug,
            connectionId: z.string(),
            table: column,
            operation: z.enum(["insert", "update", "delete"]),
            ownerColumn: column.default("user_id"),
            fields: z.record(z.string(), field).default({}),
            filters: z.array(filter).max(20).default([]),
            returnScreen: slug.optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export function parseDefinition(value) {
  let budget = 0;
  function bounded(input, depth = 0) {
    if (++budget > 60000 || depth > 80)
      throw failure(400, "Definition exceeds the depth or size limit.");
    if (Array.isArray(input)) input.forEach((v) => bounded(v, depth + 1));
    else if (input && typeof input === "object")
      for (const [key, v] of Object.entries(input)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw failure(400, "Reserved property name.");
        bounded(v, depth + 1);
      }
  }
  bounded(value);
  const parsed = definitionSchema.safeParse(value);
  if (!parsed.success)
    throw failure(
      400,
      parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 8)
        .join("; "),
    );
  const doc = parsed.data;
  for (const collection of [doc.screens, doc.components, doc.actions])
    if (new Set(collection.map((x) => x.id)).size !== collection.length)
      throw failure(400, "IDs must be unique within each collection.");
  if (!doc.screens.some((s) => s.id === doc.initialScreen))
    throw failure(400, "Initial screen does not exist.");
  try {
    validateNavigation(doc);
  } catch (error) {
    throw failure(400, error.message);
  }
  const stateKey =
    /^(?!(__proto__|prototype|constructor)$)[a-zA-Z_][a-zA-Z0-9_]*$/;
  for (const screen of doc.screens) {
    const sourceIds = [...screen.queries, ...(screen.httpQueries || [])].map(
      (q) => q.id,
    );
    if (new Set(sourceIds).size !== sourceIds.length)
      throw failure(400, "Data source IDs must be unique within a screen.");
    if (sourceIds.some((id) => !stateKey.test(id)))
      throw failure(400, "Invalid data source ID.");
    if (screen.public && screen.queries.some((q) => q.scope === "user"))
      throw failure(
        400,
        "A screen with user data must require authentication.",
      );
  }
  for (const action of doc.actions)
    if (
      action.returnScreen &&
      !doc.screens.some((s) => s.id === action.returnScreen)
    )
      throw failure(400, "Action return screen does not exist.");
  for (const c of doc.components) expandTree(c.tree, doc, [c.id]);
  for (const s of doc.screens) {
    expandTree(s.tree, doc);
    if (s.onLoad) expandTree({ type: "sizedBox", action: s.onLoad }, doc);
  }
  return doc;
}
function propValue(value, props) {
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{props\.([a-zA-Z0-9_]+)\}\}$/);
  if (exact) return props[exact[1]] ?? null;
  return value.replace(/\{\{props\.([a-zA-Z0-9_]+)\}\}/g, (_, key) =>
    String(props[key] ?? ""),
  );
}
export function expandAction(action, doc) {
  return action == null
    ? action
    : expandTree({ type: "sizedBox", action }, doc).action;
}
export function expandTree(tree, doc, chain = [], editor = false) {
  let count = 0;
  function visit(
    value,
    props = {},
    depth = 0,
    stack = chain,
    source = {},
    literalData = false,
  ) {
    if (++count > 10000 || depth > 64)
      throw failure(400, "Screen exceeds the component expansion limit.");
    if (typeof value === "string") return propValue(value, props);
    if (Array.isArray(value))
      return value.map((v) =>
        visit(v, props, depth + 1, stack, source, literalData),
      );
    if (!value || typeof value !== "object") return value;
    if (!literalData && value.type === "component") {
      const component = doc.components.find((c) => c.id === value.componentId);
      if (!component)
        throw failure(400, `Unknown component: ${value.componentId}`);
      if (stack.includes(component.id))
        throw failure(
          400,
          `Component cycle: ${[...stack, component.id].join(" → ")}`,
        );
      const supplied = visit(
        value.values || {},
        props,
        depth + 1,
        stack,
        source,
      );
      const expanded = visit(
        component.tree,
        { ...component.defaults, ...supplied },
        depth + 1,
        [...stack, component.id],
        source.instanceId && source.instanceId !== "preview"
          ? source
          : { instanceId: value.id, componentId: component.id },
      );
      return namespaceIds(expanded, value.id || `component-${count}`);
    }
    if (
      !literalData &&
      (value.type || value.widgetType) &&
      ![
        ...widgetTypes,
        "if",
        "changeTab",
        "openDrawer",
        "callback",
        "submit",
        "set",
        "toggle",
        "navigate",
        "replace",
        "pop",
        "snackbar",
        "dialog",
        "refresh",
        "increment",
        "append",
        "request",
        "operation",
      ].includes(value.type || value.widgetType)
    )
      throw failure(
        400,
        `Unsupported widget: ${value.type || value.widgetType}`,
      );
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw failure(400, "Reserved property name.");
      // Literal design copy must also bypass component property substitution.
      output[key] =
        key === "text" &&
        value.literal === true &&
        ["text", "selectableText"].includes(value.type)
          ? child
          : visit(
              child,
              props,
              depth + 1,
              stack,
              source,
              literalData ||
                [
                  "data",
                  "query",
                  "arguments",
                  "items",
                  "initialItems",
                  "rows",
                  "columns",
                  "options",
                  "markers",
                  "initialData",
                ].includes(key),
            );
    }
    if (
      !literalData &&
      editor &&
      widgetTypes.includes(value.type || value.widgetType)
    )
      output._studioSource = {
        nodeId:
          source.instanceId && source.instanceId !== "preview"
            ? source.instanceId
            : value.id,
        sourceId: value.id,
        componentId: source.componentId,
      };
    return output;
  }
  const result = visit(tree);
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !widgetTypes.includes(result.type || result.widgetType)
  )
    throw failure(400, "A screen/component needs a widget root.");
  return result;
}
// Authoring identities travel separately from production widget JSON. Expanded
// component internals select their instance; component editing selects its source.
export function expandPreviewTree(tree, doc) {
  const widgets = expandTree(tree, doc, [], true),
    sourceMap = {};
  function collect(value) {
    if (!value || typeof value !== "object") return;
    if (value._studioSource) {
      if (value.id) sourceMap[value.id] = value._studioSource;
      delete value._studioSource;
    }
    Object.values(value).forEach(collect);
  }
  collect(widgets);
  return { widgets, sourceMap };
}
function namespaceIds(value, prefix) {
  if (Array.isArray(value)) return value.map((v) => namespaceIds(v, prefix));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value))
    result[key] = namespaceIds(child, prefix);
  if (
    widgetTypes.includes(result.type || result.widgetType) &&
    typeof result.id === "string"
  )
    result.id = `${prefix}:${result.id}`;
  // Form references are identifiers too, while data field names remain stable.
  if (result.type === "submit" && typeof result.form === "string")
    result.form = `${prefix}:${result.form}`;
  return result;
}
