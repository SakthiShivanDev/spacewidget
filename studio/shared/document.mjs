// Browser-independent authoring primitives, also used by server templates.
export const uid = () => `node_${crypto.randomUUID().slice(0, 8)}`;
export const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
export const clone = (value) => structuredClone(value);
export function hydrate(doc, catalog) {
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (
        catalog.includes(value.type || value.widgetType) ||
        (value.type || value.widgetType) === "component"
      )
        value.id ||= uid();
      Object.values(value).forEach(visit);
    }
  };
  visit(doc);
  return doc;
}
