import { nodes, updateNode, clone, uid } from "./model.js";

// Saved operations describe the input contract; the inspector should not ask a
// designer to remember field names from a different part of Studio.
export function operationInputs(operation) {
  const data = operation.operation === "delete" ? {} : { ...operation.fields };
  const query = {};
  for (const filter of operation.filters || []) {
    const value = filter.value;
    if (
      !value ||
      typeof value !== "object" ||
      !["body", "query"].includes(value.from)
    )
      continue;
    const target = value.from === "body" ? data : query;
    target[value.key] = {
      ...target[value.key],
      type: target[value.key]?.type || "string",
      required: !filter.optional || target[value.key]?.required,
    };
  }
  return { data, query };
}

export function requestOptions(modules, services) {
  return [
    ...modules
      .filter((m) => m.kind === "javascript")
      .map((m) => ({
        id: m.id,
        name: m.published_revision ? m.id : `${m.id} · enable in Custom code`,
        kind: "function",
        source: `/runtime/functions/${m.id}`,
        method: "POST",
        disabled: !m.published_revision,
      })),
    ...services.flatMap((service) =>
      service.endpoints.map((e) => ({
        id: `${service.id}/${e.id}`,
        name: `${service.id} · ${e.id}`,
        kind: "api",
        source: `/runtime/http/${service.id}/${e.id}`,
        method: e.method,
      })),
    ),
  ];
}

export function openingOverlays(action) {
  const result = [];
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (["dialog", "bottomSheet"].includes(value.type) && value.content?.id)
      result.push(value.content);
    for (const [key, child] of Object.entries(value))
      if (key !== "content") visit(child);
  }
  visit(action);
  return result;
}

export function componentUsage(document, id) {
  return [
    ...document.screens
      .filter((s) =>
        nodes([s.tree, s.onLoad]).some((n) => n.componentId === id),
      )
      .map((s) => ({ ...s, kind: "screen" })),
    ...document.components
      .filter(
        (c) => c.id !== id && nodes(c.tree).some((n) => n.componentId === id),
      )
      .map((c) => ({ ...c, kind: "component" })),
  ];
}

export function screenUsage(document, id) {
  const references = (value) => {
    if (!value || typeof value !== "object") return false;
    if (
      ["navigate", "replace"].includes(value.type) &&
      value.source === `/runtime/screens/${id}`
    )
      return true;
    return Object.values(value).some(references);
  };
  return [
    ...document.screens
      .filter((s) => s.id !== id && references([s.tree, s.onLoad]))
      .map((s) => s.name),
    ...document.components.filter((c) => references(c.tree)).map((c) => c.name),
    ...document.actions.filter((a) => a.returnScreen === id).map((a) => a.id),
  ];
}

export function extractComponent(
  document,
  { componentId, screenId, nodeId, id, name },
) {
  if (document.components.some((c) => c.id === id))
    throw new Error("A component with this name already exists.");
  const result = clone(document);
  const owner = componentId
    ? result.components.find((c) => c.id === componentId)
    : result.screens.find((s) => s.id === screenId);
  if (!owner) throw new Error("Choose a screen or component first.");
  const inOpening = !nodes(owner.tree).some((n) => n.id === nodeId);
  const source = inOpening ? owner.onLoad : owner.tree;
  const node = nodes(source).find((n) => n.id === nodeId);
  if (!node) throw new Error("Choose a layer to make reusable.");
  result.components.push({ id, name, defaults: {}, tree: clone(node) });
  owner[inOpening ? "onLoad" : "tree"] = updateNode(source, nodeId, () => ({
    type: "component",
    id: uid(),
    componentId: id,
    values: {},
  }));
  return result;
}
