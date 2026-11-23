import {
  isWidget,
  widgetType,
  widgetNames,
  widgetCatalog,
  properties,
  fieldTypes,
  tapWidgetTypes,
  patchProperties,
} from "./widget-catalog.js";
import { uid, slug, clone, hydrate } from "./document.mjs";
export { uid, slug, clone, hydrate };
export function nodes(value, result = []) {
  if (Array.isArray(value)) for (const item of value) nodes(item, result);
  else if (value && typeof value === "object") {
    if (isWidget(value) && typeof value.id === "string") result.push(value);
    for (const child of Object.values(value)) nodes(child, result);
  }
  return result;
}
export function updateNode(tree, id, operation) {
  if (Array.isArray(tree))
    return tree
      .map((v) => updateNode(v, id, operation))
      .filter((v) => v !== null);
  if (!tree || typeof tree !== "object") return tree;
  if (tree.id === id && isWidget(tree)) return operation(tree);
  return Object.fromEntries(
    Object.entries(tree).map(([k, v]) => [k, updateNode(v, id, operation)]),
  );
}
export function widget(type) {
  const item = {
    type,
    id: uid(),
    ...structuredClone(widgetCatalog[type]?.defaults || {}),
  };
  if (fieldTypes.includes(type) && Object.hasOwn(item, "name"))
    item.name = `${item.name}_${item.id.slice(5)}`;
  if (
    [
      "navigationBar",
      "bottomNavigationBar",
      "navigationRail",
      "stepper",
    ].includes(type)
  )
    item.bind = `${item.bind}_${item.id.slice(5)}`;
  return hydrate(item, widgetNames);
}

// Give context-sensitive Flutter widgets the parent they require when inserting
// into an ordinary screen. Selecting a real compatible parent keeps its layout.
export function prepareInsertion(node, parentType, ancestors = []) {
  const placement = widgetCatalog[widgetType(node)]?.placement;
  const wrap = (type, value) => ({ type, id: uid(), ...value });
  if (
    placement === "sliver" &&
    !["customScrollView", "sliverPadding", "nestedScrollView:headers"].includes(
      parentType,
    )
  )
    return wrap("sizedBox", {
      height: 240,
      child: wrap("customScrollView", { children: [node] }),
    });
  if (
    ["customScrollView", "sliverPadding"].includes(parentType) &&
    placement !== "sliver"
  )
    return wrap("sliverToBoxAdapter", { child: node });
  if (placement === "flex" && !["row", "column"].includes(parentType))
    return wrap("row", { children: [node] });
  if (placement === "positioned" && parentType !== "stack")
    return wrap("sizedBox", {
      height: 160,
      child: wrap("stack", { children: [node] }),
    });
  if (placement === "tabs" || placement === "tabView") {
    const bounded =
      placement === "tabView"
        ? wrap("sizedBox", { height: 180, child: node })
        : node;
    if (ancestors.includes("defaultTabController")) return bounded;
    // A standalone tab bar or page view cannot form a working tab interface.
    // Insert its companion and controller together, retaining the chosen IDs.
    let controller = widget("defaultTabController");
    const companion = nodes(controller).find(
      (n) => widgetType(n) === widgetType(node),
    );
    controller = updateNode(controller, companion.id, () => node);
    return synchronizeTabs(controller, node.id);
  }
  if (placement === "bounded")
    return wrap("sizedBox", { height: 200, width: 280, child: node });
  return node;
}

export function insertInto(tree, target, node) {
  const screenSlots = {
    bottomNavigationBar: "bottomNavigationBar",
    navigationBar: "bottomNavigationBar",
    appBar: "appBar",
    drawer: "drawer",
    floatingActionButton: "floatingActionButton",
  };
  const screenSlot = screenSlots[widgetType(node)];
  if (
    widgetType(tree) === "scaffold" &&
    screenSlot &&
    !properties(tree)[screenSlot]
  )
    return patchProperties(tree, { [screenSlot]: node });
  let inserted = false;
  function append(parent, ancestors = []) {
    const type = widgetType(parent),
      slot = widgetCatalog[type]?.slot;
    const p = properties(parent);
    // A form with a child renders that child, ignoring its children array.
    const chosenSlot = type === "form" && p.child ? "child" : slot;
    if (
      chosenSlot === "children" ||
      (!chosenSlot && Array.isArray(parent.children))
    )
      return {
        ...parent,
        children: [
          ...(parent.children || []),
          prepareInsertion(node, type, ancestors),
        ],
      };
    if (chosenSlot) {
      const child = p[chosenSlot];
      return patchProperties(parent, {
        [chosenSlot]:
          child && isWidget(child)
            ? append(child, [...ancestors, type])
            : prepareInsertion(node, type, [...ancestors, type]),
      });
    }
    return {
      type: "column",
      id: uid(),
      mainAxisSize: "min",
      children: [parent, prepareInsertion(node, "column", ancestors)],
    };
  }
  function visit(value, ancestors = []) {
    if (Array.isArray(value)) {
      const out = [];
      for (const child of value) {
        out.push(visit(child, ancestors));
        if (!inserted && isWidget(child) && child.id === target) {
          out.push(prepareInsertion(node, ancestors.at(-1), ancestors));
          inserted = true;
        }
      }
      return out;
    }
    if (!value || typeof value !== "object") return value;
    if (
      !inserted &&
      value.id === target &&
      isWidget(value) &&
      (widgetCatalog[widgetType(value)]?.slot || Array.isArray(value.children))
    ) {
      inserted = true;
      return append(value, ancestors);
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        visit(
          v,
          isWidget(value) ? [...ancestors, widgetType(value)] : ancestors,
        ),
      ]),
    );
  }
  const next = visit(tree);
  return inserted ? next : append(tree);
}

export function duplicateWidget(node) {
  const copy = structuredClone(node),
    ids = new Map();
  for (const item of nodes(copy)) {
    const fresh = uid();
    ids.set(item.id, fresh);
    item.id = fresh;
  }
  function references(value) {
    if (Array.isArray(value)) value.forEach(references);
    else if (value && typeof value === "object") {
      if (value.type === "submit" && ids.has(value.form))
        value.form = ids.get(value.form);
      Object.values(value).forEach(references);
    }
  }
  references(copy);
  return copy;
}

// Structural commands preserve the original subtree and reject lossy edits.
export function nodeLocation(tree, id, parent = null, slot = null) {
  if (!tree || typeof tree !== "object") return null;
  if (isWidget(tree) && tree.id === id) return { node: tree, parent, slot };
  for (const [key, value] of Object.entries(tree)) {
    if (!value || typeof value !== "object") continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = nodeLocation(
        child,
        id,
        isWidget(tree) ? tree : parent,
        isWidget(tree) ? key : ["props", "style"].includes(slot) ? key : slot,
      );
      if (found) return found;
    }
  }
  return null;
}
export function insertBeside(tree, targetId, item, position = "after") {
  const location = nodeLocation(tree, targetId);
  if (!location?.parent)
    throw new Error("Select a layer inside the screen first.");
  const { parent, slot, node } = location;
  if (!canPlace(widgetType(item), widgetType(parent), slot))
    throw new Error("This widget cannot be placed in that slot.");
  if (Array.isArray(parent[slot])) {
    return updateNode(tree, parent.id, (n) => ({
      ...n,
      [slot]: n[slot].flatMap((child) =>
        child?.id !== targetId
          ? [child]
          : position === "before"
            ? [prepareInsertion(item, widgetType(parent)), child]
            : [child, prepareInsertion(item, widgetType(parent))],
      ),
    }));
  }
  if (!["child", "body"].includes(slot))
    throw new Error(
      "This slot accepts one widget. Wrap or replace it instead.",
    );
  const children = position === "before" ? [item, node] : [node, item];
  return updateNode(tree, targetId, () => ({
    type: "column",
    id: uid(),
    mainAxisSize: "min",
    children,
  }));
}
export function duplicateInTree(tree, id) {
  const source = nodeLocation(tree, id)?.node;
  if (!source) throw new Error("Select a widget to duplicate.");
  const copy = duplicateWidget(source);
  return { tree: insertBeside(tree, id, copy), id: copy.id };
}
export const wrapperTypes = new Set(
  Object.entries(widgetCatalog)
    .filter(([type, entry]) => entry.slot && type !== "scaffold")
    .map(([type]) => type),
);
export function canPlace(type, parentType, slot) {
  if (slot === "appBar") return type === "appBar";
  if (slot === "bottomNavigationBar")
    return ["bottomNavigationBar", "navigationBar"].includes(type);
  if (
    slot === "headers" ||
    ["customScrollView", "sliverPadding"].includes(parentType)
  )
    return widgetCatalog[type]?.placement === "sliver";
  if (parentType === "tabBar") return type === "tab";
  if (parentType === "richText" || parentType === "textSpan")
    return type === "textSpan";
  const placement = widgetCatalog[type]?.placement;
  if (placement === "flex") return ["row", "column"].includes(parentType);
  if (placement === "positioned") return parentType === "stack";
  if (placement === "sliver") return false;
  return !["appBar", "tab", "textSpan", "scaffold"].includes(type);
}
export function wrapWidget(tree, id, type) {
  const location = nodeLocation(tree, id);
  if (!location || !wrapperTypes.has(type))
    throw new Error("Choose a compatible wrapper.");
  if (
    (!location.parent && widgetType(location.node) === "scaffold") ||
    (location.parent &&
      !canPlace(type, widgetType(location.parent), location.slot))
  )
    throw new Error("This wrapper is not compatible with the selected slot.");
  let wrapper = widget(type);
  const slot = widgetCatalog[type]?.slot;
  if (!slot) throw new Error("This widget cannot contain another widget.");
  if (!canPlace(widgetType(location.node), type, slot))
    throw new Error("This wrapper cannot contain the selected widget.");
  delete wrapper.child;
  delete wrapper.children;
  wrapper[slot] = slot === "children" ? [location.node] : location.node;
  if (
    type === "refreshIndicator" &&
    ![
      "listView",
      "gridView",
      "customScrollView",
      "singleChildScrollView",
    ].includes(widgetType(location.node))
  )
    wrapper.child = {
      type: "singleChildScrollView",
      id: uid(),
      child: location.node,
    };
  const ancestors = [];
  let parent = location.parent;
  while (parent) {
    ancestors.unshift(widgetType(parent));
    parent = nodeLocation(tree, parent.id)?.parent;
  }
  return {
    tree: updateNode(tree, id, () =>
      prepareInsertion(wrapper, widgetType(location.parent), ancestors),
    ),
    id: wrapper.id,
  };
}
const oldRootIsScreen = (tree) => widgetType(tree) === "scaffold";
export function replaceWidget(tree, id, type) {
  const location = nodeLocation(tree, id);
  if (!location || !widgetCatalog[type] || type === "component")
    throw new Error("Choose a widget type.");
  if (
    location.parent &&
    !canPlace(type, widgetType(location.parent), location.slot)
  )
    throw new Error("This widget type is not compatible with its parent slot.");
  if (!location.parent && oldRootIsScreen(tree) && type !== "scaffold")
    throw new Error("Keep Scaffold as the screen root.");
  const old = properties(location.node),
    slot = widgetCatalog[type]?.slot;
  const children = old.child ? [old.child] : old.children || [];
  const extraSlots = Object.entries(old).filter(
    ([k, v]) =>
      !["child", "children"].includes(k) &&
      (isWidget(v) || (Array.isArray(v) && v.some(isWidget))),
  );
  const fields = new Set(widgetCatalog[type].fields.map((f) => f.key));
  if ((children.length && !slot) || extraSlots.some(([k]) => !fields.has(k)))
    throw new Error(
      "This replacement would remove child widgets. Choose a layout widget or move the children first.",
    );
  const next = widget(type);
  next.id = id;
  for (const [key, value] of Object.entries(old))
    if (
      (fields.has(key) || key === "labelName") &&
      !["child", "children"].includes(key)
    )
      next[key] = clone(value);
  if (tapWidgetTypes.has(type)) {
    const action = old.action ?? old.onPressed ?? old.onTap;
    delete next.action;
    delete next.onPressed;
    delete next.onTap;
    if (action !== undefined) next.action = clone(action);
  }
  if (old.type === "icon" && type === "iconButton") {
    next.icon = old.name || old.icon;
    next.iconSize = old.size;
    next.iconColor = old.color;
    delete next.name;
    delete next.size;
    delete next.color;
    delete next.action;
    delete next.onPressed;
  }
  if (old.type === "iconButton" && type === "icon") {
    next.name = old.icon;
    next.size = old.iconSize;
    next.color = old.iconColor || old.color;
  }
  if (slot && children.length) {
    if (children.some((c) => !canPlace(widgetType(c), type, slot)))
      throw new Error(
        "The existing children are not compatible with this widget.",
      );
    delete next.child;
    delete next.children;
    next[slot] =
      slot === "children"
        ? children
        : children.length === 1
          ? children[0]
          : { type: "column", id: uid(), mainAxisSize: "min", children };
  }
  return updateNode(tree, id, () => next);
}

export function moveSibling(tree, target, direction) {
  if (Array.isArray(tree)) {
    const list = tree.map((v) => moveSibling(v, target, direction));
    const index = list.findIndex((v) => v?.id === target),
      next = index + direction;
    if (index >= 0 && next >= 0 && next < list.length)
      [list[index], list[next]] = [list[next], list[index]];
    return list;
  }
  if (!tree || typeof tree !== "object") return tree;
  return Object.fromEntries(
    Object.entries(tree).map(([k, v]) => [
      k,
      moveSibling(v, target, direction),
    ]),
  );
}

// Reparent existing nodes without losing IDs, form references or state. Reject
// moving a parent into its descendants and keep single-child slots well formed.
export function moveWidget(tree, sourceId, targetId, position = "inside") {
  if (!sourceId || !targetId || sourceId === targetId || tree.id === sourceId)
    return tree;
  const source = nodes(tree).find((n) => n.id === sourceId);
  const target = nodes(tree).find((n) => n.id === targetId);
  if (!source || !target || nodes(source).some((n) => n.id === targetId))
    return tree;
  if (position === "inside") {
    if (
      !widgetCatalog[widgetType(target)]?.slot &&
      !Array.isArray(target.children)
    )
      return tree;
    return insertInto(
      updateNode(tree, sourceId, () => null),
      targetId,
      source,
    );
  }
  const without = updateNode(tree, sourceId, () => null);
  return insertBeside(without, targetId, source, position);
}
export function resolve(value, state, scope = {}) {
  if (typeof value !== "string") return value;
  const read = (path) =>
    path
      .trim()
      .split(".")
      .reduce((v, k) => v?.[k], { ...state, ...scope });
  const exact = value.match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (exact) return read(exact[1]);
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, path) =>
    String(read(path) ?? ""),
  );
}

// Keep the tab bar, pages and controller length in agreement when a user edits
// either child list. Nested controllers are independent tab groups.
export function synchronizeTabs(tree, changedId) {
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    let next = Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, visit(v)]),
    );
    if (widgetType(next) !== "defaultTabController") return next;
    const groups = [];
    function collect(v) {
      if (Array.isArray(v)) return v.forEach(collect);
      if (
        !v ||
        typeof v !== "object" ||
        widgetType(v) === "defaultTabController"
      )
        return;
      if (["tabBar", "tabBarView"].includes(widgetType(v))) groups.push(v);
      Object.values(v).forEach(collect);
    }
    collect(properties(next).child);
    const changed =
      next.id === changedId
        ? null
        : groups.find((v) => nodes(v).some((n) => n.id === changedId)) ||
          groups.find(
            (v) =>
              (properties(v).children?.length || 0) !==
              Number(properties(next).length),
          );
    if (!changed && next.id !== changedId) return next;
    const count = Math.max(
      1,
      Math.min(
        50,
        changed
          ? properties(changed).children?.length || 1
          : Number(properties(next).length) || 1,
      ),
    );
    for (const group of groups) {
      const list = [...(properties(group).children || [])].slice(0, count);
      while (list.length < count)
        list.push(widget(widgetType(group) === "tabBar" ? "tab" : "text"));
      next = updateNode(next, group.id, (node) =>
        patchProperties(node, { children: list }),
      );
    }
    return patchProperties(next, {
      length: count,
      initialIndex: Math.min(properties(next).initialIndex || 0, count - 1),
    });
  }
  return visit(tree);
}
