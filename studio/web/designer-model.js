import { nodes } from "./model.js";
import { properties, fieldsFor } from "./widget-catalog.js";

export const friendlyName = (value) =>
  String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
export const optionLabel = (value) =>
  ({
    true: "On",
    false: "Off",
    min: "Fit content",
    max: "Fill available space",
    start: "Start",
    end: "End",
    spaceBetween: "Space between",
    spaceAround: "Space around",
    spaceEvenly: "Even spacing",
    stretch: "Stretch to fill",
    cover: "Crop to fill",
    contain: "Fit inside",
    fill: "Stretch",
    vertical: "Vertical",
    horizontal: "Horizontal",
    none: "None",
    lineThrough: "Strikethrough",
    topLeft: "Top left",
    topCenter: "Top center",
    topRight: "Top right",
    centerLeft: "Center left",
    centerRight: "Center right",
    bottomLeft: "Bottom left",
    bottomCenter: "Bottom center",
    bottomRight: "Bottom right",
  })[value] || friendlyName(value);
const advanced = new Set(
  "literal semanticLabel name bind positionBind primary shrinkWrap automaticallyImplyLeading resizeToAvoidBottomInset extendBody maintainState ignoring absorbing liveRegion rowKey query nextCursor initialData initialItems debounce stream package source appBarHeight bottomHeight minChildSize maxChildSize initialChildSize hasScrollBody pinned floating length initialIndex".split(
    " ",
  ),
);
export function designerField(field, type) {
  if (
    (advanced.has(field.key) && !(type === "icon" && field.key === "name")) ||
    field.kind === "action" ||
    ["json", "array"].includes(field.kind)
  )
    return false;
  if (type === "repeat" && ["items", "template"].includes(field.key))
    return false;
  return true;
}
export function activeDesignerField(field, node) {
  const p = properties(node);
  if (p.type === "alertDialog") {
    if (p.content != null && ["text", "child"].includes(field.key))
      return false;
    if (p.child != null && field.key === "text") return false;
  }
  return true;
}
export function designGroup(field) {
  if (
    "fontFamily fontSize fontWeight italic letterSpacing lineHeight textAlign decoration maxLines"
      .split(" ")
      .includes(field.key)
  )
    return "Typography";
  if (
    [
      "backgroundColor",
      "color",
      "opacity",
      "elevation",
      "shadowColor",
    ].includes(field.key)
  )
    return "Fill & effects";
  if (["borderColor", "borderWidth", "borderRadius"].includes(field.key))
    return "Stroke & corners";
  return (
    {
      Properties: "Content",
      "Child widgets": "Contents",
      Layout: "Layout",
      Events: "Events",
      Appearance: "Appearance",
    }[field.group] || "Content"
  );
}
export function nodePath(tree, id, path = []) {
  if (!tree || typeof tree !== "object") return null;
  const next =
    (tree.type || tree.widgetType) && tree.id ? [...path, tree] : path;
  if (tree.id === id && (tree.type || tree.widgetType)) return next;
  for (const value of Object.values(tree)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = nodePath(child, id, next);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = nodePath(value, id, next);
      if (found) return found;
    }
  }
  return null;
}
// Database columns and sampled API/state records share the designer's field picker.
export function screenSources(screen, sample = {}) {
  const sources = [...(screen?.queries || [])];
  const seen = new Set(sources.map((q) => q.id));
  const visit = (value, path, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 5) return;
    const first = Array.isArray(value) ? value[0] : value;
    const fields =
      first && typeof first === "object"
        ? Object.keys(first).filter(
            (k) => !["__proto__", "constructor", "prototype"].includes(k),
          )
        : [];
    if (path && !seen.has(path)) {
      seen.add(path);
      sources.push({
        id: path,
        select: fields,
        single: !Array.isArray(value),
        scope: screen?.public ? "public" : "user",
        virtual: true,
      });
    }
    if (!Array.isArray(value))
      for (const [key, child] of Object.entries(value))
        visit(child, path ? `${path}.${key}` : key, depth + 1);
  };
  visit({ ...screen?.state, ...sample }, "");
  return sources;
}
export function queryFromBinding(value, queries) {
  const match =
    typeof value === "string" &&
    value.match(/^\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}$/);
  return match ? queries.find((q) => q.id === match[1]) : undefined;
}
export function bindingContext(
  doc,
  screen,
  tree,
  node,
  componentId,
  sample = {},
) {
  const queries = screenSources(screen, sample);
  const path = nodePath(tree, node?.id) || [];
  const repeat = [...path]
    .reverse()
    .find((n) => properties(n).type === "repeat" && n.id !== node?.id);
  let source = repeat
    ? properties(repeat).items
    : properties(node).type === "repeat"
      ? properties(node).items
      : undefined;
  if (source === "{{props.items}}" && componentId) {
    const instances = doc.screens.flatMap((s) =>
      nodes(s.tree)
        .filter((n) => n.componentId === componentId)
        .map((n) => ({ screen: s, node: n })),
    );
    const match = instances.find(({ screen: s, node: n }) =>
      queryFromBinding(n.values?.items, screenSources(s)),
    );
    if (match)
      return {
        queries: screenSources(match.screen),
        repeat,
        query: queryFromBinding(
          match.node.values?.items,
          screenSources(match.screen),
        ),
        item: !!repeat,
      };
  }
  const query = queryFromBinding(source, queries);
  const record = Array.isArray(source) ? source[0] : null;
  return {
    queries,
    repeat,
    query,
    item: !!repeat,
    itemFields:
      query?.select ||
      (record && typeof record === "object" ? Object.keys(record) : []),
  };
}
export function bindingChoices(context, target, component) {
  const choices = [],
    collectionTarget = [
      "items",
      "rows",
      "values",
      "initialItems",
      "images",
    ].includes(target);
  if (context.item && !collectionTarget)
    for (const field of context.query?.select || context.itemFields || [])
      choices.push({
        label: `Current item · ${friendlyName(field)}`,
        value: `{{item.${field}}}`,
        path: `item.${field}`,
      });
  for (const q of context.queries) {
    if (q.single && !collectionTarget)
      for (const field of q.select)
        choices.push({
          label: `${friendlyName(q.id)} · ${friendlyName(field)}`,
          value: `{{${q.id}.${field}}}`,
          path: `${q.id}.${field}`,
        });
    else if (!q.single && collectionTarget)
      choices.push({
        label: `${friendlyName(q.id)} · All records`,
        value: `{{${q.id}}}`,
        path: q.id,
      });
  }
  if (component)
    for (const [key, value] of Object.entries(component.defaults || {})) {
      if (Array.isArray(value) !== collectionTarget) continue;
      choices.push({
        label: `Component property · ${friendlyName(key)}`,
        value: `{{props.${key}}}`,
        path: `props.${key}`,
      });
    }
  return choices;
}

// Action inputs can receive a whole collection/record as well as a scalar.
// Current-record fields must come from the selected repeated item, not another
// collection elsewhere on the screen.
export function actionFieldChoices(sample, context) {
  const result = [];
  const visit = (value, path = "", depth = 0) => {
    if (depth > 4 || !value || typeof value !== "object") return;
    if (path)
      result.push([
        path,
        `${path === "item" ? "Current record" : "Screen content"} · ${friendlyName(path)}${Array.isArray(value) ? " · All records" : " · Record"}`,
      ]);
    if (Array.isArray(value)) {
      if (path === context?.query?.id && value[0])
        visit(value[0], "item", depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      const next = path ? `${path}.${key}` : key;
      if (child === null || typeof child !== "object")
        result.push([
          next,
          `${path === "item" ? "Current record" : "Screen content"} · ${friendlyName(next)}`,
        ]);
      else visit(child, next, depth + 1);
    }
  };
  visit(sample);
  for (const q of context?.queries || []) {
    if (q.single)
      for (const field of q.select)
        result.push([
          `${q.id}.${field}`,
          `${friendlyName(q.id)} · ${friendlyName(field)}`,
        ]);
    else result.push([q.id, `${friendlyName(q.id)} · All records`]);
  }
  if (context?.item)
    for (const field of context.query?.select || context.itemFields || [])
      result.push([`item.${field}`, `Current record · ${friendlyName(field)}`]);
  return [...new Map(result.map((entry) => [entry[0], entry])).values()];
}
export function designerPresentation(field) {
  const names = {
    src: "Media URL",
    fontFamily: "Typeface",
    borderRadius: "Corner radius",
    helperText: "Help text",
    mainAxisAlignment: "Distribution",
    crossAxisAlignment: "Item alignment",
    mainAxisSize: "Container size",
    childAspectRatio: "Card proportions",
    mainAxisExtent: "Card height",
    crossAxisCount: "Columns",
    crossAxisSpacing: "Column gap",
    mainAxisSpacing: "Row gap",
    flex: "Space share",
    fit: "Image fit",
    runSpacing: "Line gap",
    maxLines: "Line limit",
    keyboardType: "Keyboard",
    obscureText: "Hide typed characters",
    autovalidate: "Validate while typing",
  };
  const hints = {
    mainAxisAlignment: "Arrange items along the layout direction.",
    crossAxisAlignment: "Align items across the layout.",
    childAspectRatio: "Width divided by height. 1 makes a square.",
    lineHeight: "A multiplier of the font size. 1.5 adds space between lines.",
  };
  return {
    ...field,
    label: names[field.key] || field.label,
    hint: hints[field.key],
  };
}
export function previewValue(path, sample, context, component) {
  let value = path.startsWith("item.")
    ? context.query?.id
        ?.split(".")
        .reduce((value, key) => value?.[key], sample)?.[0] || {}
    : path.startsWith("props.")
      ? { props: component?.defaults }
      : sample;
  const parts = path.startsWith("item.")
    ? path.slice(5).split(".")
    : path.split(".");
  for (const key of parts) value = value?.[key];
  if (value === undefined || value === null) return "No sample value yet";
  if (Array.isArray(value)) return `${value.length} records`;
  if (typeof value === "object") return "Record";
  return String(value).slice(0, 100);
}
export function bindingPatch(node, target, value) {
  if (!fieldsFor(node).some((f) => f.key === target))
    throw new Error("Choose a supported property.");
  return {
    ...{ [target]: value },
    ...(target === "text" ? { literal: false } : {}),
  };
}
export function repeatedCollection(
  query,
  { layout = "list", titleField, subtitleField, imageField } = {},
  makeId,
) {
  const title =
    titleField ||
    query.select.find((k) => ["name", "title", "label"].includes(k)) ||
    query.select[0];
  const subtitle =
    subtitleField ??
    query.select.find((k) =>
      ["description", "category", "subtitle", "email"].includes(k),
    );
  const image =
    imageField ||
    query.select.find((k) =>
      ["image_url", "image", "thumbnail", "thumbnail_url"].includes(k),
    );
  const template =
    layout === "grid"
      ? {
          type: "container",
          id: makeId(),
          padding: 16,
          borderRadius: 12,
          backgroundColor: "#FFFFFF",
          borderColor: "#E6E6EB",
          borderWidth: 1,
          child: {
            type: "column",
            id: makeId(),
            crossAxisAlignment: "start",
            children: [
              ...(image
                ? [
                    {
                      type: "image",
                      id: makeId(),
                      src: `{{item.${image}}}`,
                      height: 100,
                      fit: "cover",
                    },
                  ]
                : []),
              {
                type: "text",
                id: makeId(),
                text: `{{item.${title}}}`,
                fontSize: 16,
                fontWeight: 600,
                maxLines: 2,
              },
              ...(subtitle
                ? [
                    {
                      type: "text",
                      id: makeId(),
                      text: `{{item.${subtitle}}}`,
                      fontSize: 13,
                      color: "#676778",
                      maxLines: 2,
                    },
                  ]
                : []),
            ],
          },
        }
      : {
          type: "listTile",
          id: makeId(),
          title: `{{item.${title}}}`,
          ...(subtitle ? { subtitle: `{{item.${subtitle}}}` } : {}),
        };
  return {
    type: "repeat",
    id: makeId(),
    labelName: `${friendlyName(query.id)} ${layout === "grid" ? "grid" : "list"}`,
    items: `{{${query.id}}}`,
    layout,
    crossAxisCount: 2,
    crossAxisSpacing: 12,
    mainAxisSpacing: 12,
    childAspectRatio: 0.8,
    template,
    empty: {
      type: "text",
      id: makeId(),
      text: `No ${friendlyName(query.id).toLowerCase()} to display.`,
    },
  };
}

// Flutter uses ARGB; HTML's color input expects opaque RGB.
export function colorSwatch(value) {
  const names = {
    transparent: "#000000",
    black: "#000000",
    white: "#ffffff",
    red: "#f44336",
    green: "#4caf50",
    blue: "#2196f3",
    grey: "#9e9e9e",
    orange: "#ff9800",
    purple: "#9c27b0",
    teal: "#009688",
  };
  if (typeof value === "number" && Number.isInteger(value))
    value = `#${(value >>> 0).toString(16).padStart(8, "0")}`;
  if (typeof value !== "string") return "#000000";
  if (names[value]) return names[value];
  let hex = value.replace(/^(#|0x)/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  if (hex.length === 8) hex = hex.slice(2);
  return /^[a-f0-9]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : "#000000";
}
export function applyColorSwatch(previous, rgb) {
  if (typeof previous === "number" && Number.isInteger(previous))
    previous = `#${(previous >>> 0).toString(16).padStart(8, "0")}`;
  const match =
    typeof previous === "string" &&
    previous.match(/^(?:#|0x)?([a-f0-9]{2})[a-f0-9]{6}$/i);
  return match ? `#${match[1]}${rgb.slice(1)}` : rgb;
}
