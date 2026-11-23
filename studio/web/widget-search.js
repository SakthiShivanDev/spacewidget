import { widgetCatalog, fieldTypes } from "./widget-catalog.js";

export const widgetLabel = (name = "") =>
  name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (s) => s.toUpperCase());
const normalize = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function widgetCategory(type) {
  if (/login|signUp|password|otp|auth|session/i.test(type))
    return "Authentication";
  if (
    fieldTypes.includes(type) ||
    /form|checkbox|radio|slider|switch|datePicker|timePicker/i.test(type)
  )
    return "Forms & input";
  if (/navigation|appBar|drawer|tab|stepper|scaffold/i.test(type))
    return "Navigation";
  if (
    /row|column|stack|positioned|expanded|flexible|wrap|padding|align|center|sized|constraint|aspect|safeArea|layout|sliver|scroll|listView|gridView/i.test(
      type,
    )
  )
    return "Layout";
  if (
    /repeat|conditional|responsive|stream|future|remote|pagination/i.test(type)
  )
    return "Data & logic";
  if (/image|video|audio|media|map|pdf|camera/i.test(type)) return "Media";
  return "Content & controls";
}
// Components that reach the component being edited would create a cycle.
export function availableComponents(components, editingId) {
  function reaches(id, seen = new Set()) {
    if (id === editingId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const component = components.find((c) => c.id === id);
    const references = [];
    function visit(v) {
      if (!v || typeof v !== "object") return;
      if (v.type === "component") references.push(v.componentId);
      Object.values(v).forEach(visit);
    }
    visit(component?.tree);
    return references.some((next) => reaches(next, seen));
  }
  return components.filter((c) => !editingId || !reaches(c.id));
}
export function widgetOptions({
  components = [],
  editingId,
  form = false,
  parentType,
  slot,
} = {}) {
  let types = form
    ? fieldTypes
    : Object.keys(widgetCatalog).filter((t) => t !== "component");
  if (slot === "appBar") types = types.filter((t) => t === "appBar");
  if (slot === "headers")
    types = types.filter((t) => widgetCatalog[t]?.placement === "sliver");
  if (parentType === "tabBar" && slot === "children")
    types = types.filter((t) => t === "tab");
  const result = types.map((type) => ({
    value: type,
    label: widgetLabel(type),
    category: widgetCategory(type),
    type,
  }));
  function rootType(component, seen = new Set()) {
    if (!component || seen.has(component.id)) return null;
    seen.add(component.id);
    return component.tree.type === "component"
      ? rootType(
          components.find((c) => c.id === component.tree.componentId),
          seen,
        )
      : component.tree.type || component.tree.widgetType;
  }
  result.push(
    ...availableComponents(components, editingId)
      .filter((c) => {
        const type = rootType(c);
        if (slot === "appBar") return type === "appBar";
        if (slot === "headers")
          return widgetCatalog[type]?.placement === "sliver";
        if (parentType === "tabBar") return type === "tab";
        return !form || fieldTypes.includes(type);
      })
      .map((c) => ({
        value: `component:${c.id}`,
        label: c.name,
        category: "Your components",
        type: "component",
      })),
  );
  return result;
}
export function searchWidgets(options, query = "") {
  const words = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!words.length) return options;
  return options
    .map((option) => {
      const name = normalize(option.label),
        type = normalize(option.value),
        category = normalize(option.category);
      let score = 0;
      for (const word of words) {
        if (name === word || type === word) score += 100;
        else if (name.startsWith(word) || type.startsWith(word)) score += 60;
        else if (name.includes(word) || type.includes(word)) score += 40;
        else if (category.includes(word)) score += 10;
        else {
          let index = 0;
          for (const letter of name) if (letter === word[index]) index++;
          if (index !== word.length) return null;
          score += 1;
        }
      }
      return { option, score };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.score - a.score || a.option.label.localeCompare(b.option.label),
    )
    .map((v) => v.option);
}
