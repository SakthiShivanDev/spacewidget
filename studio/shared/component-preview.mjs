// Samples are editor-only. Missing values never change production bindings.
export function componentItemFields(component) {
  const fields = new Map();
  function visit(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string") {
        for (const match of child.matchAll(
          /\{\{\s*item\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
        )) {
          fields.set(
            match[1],
            key === "condition" || key === "visible" || key === "enabled"
              ? "boolean"
              : fields.get(match[1]) || "string",
          );
        }
      } else visit(child);
    }
  }
  visit(component.tree);
  return fields;
}
export function componentPreviewState(component, state) {
  const item = {
    ...(state.item ||
      Object.values(state).find(
        (v) => Array.isArray(v) && v[0] && typeof v[0] === "object",
      )?.[0] ||
      {}),
    ...component.previewData?.item,
  };
  for (const [name, type] of componentItemFields(component))
    if (item[name] == null)
      item[name] =
        type === "boolean"
          ? true
          : name === "price" || name === "stock"
            ? 1
            : name === "image"
              ? ""
              : name.replace(/([A-Z])/g, " $1");
  return { ...state, ...component.previewData, item };
}
