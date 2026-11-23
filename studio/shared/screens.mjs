// The same composition is used by authoring preview and production delivery.
export const effective = (node) => ({
  ...node?.style,
  ...node,
  ...node?.props,
});
export function navigationBar(doc) {
  const owner = doc.screens.find((s) => s.id === doc.navigation?.screenId);
  return owner ? effective(owner.tree).bottomNavigationBar : null;
}
export function navigationDestinations(doc) {
  return effective(navigationBar(doc)).destinations || [];
}
export function resolveScreen(doc, id) {
  const destinations = navigationDestinations(doc);
  if (
    id === doc.navigation?.screenId &&
    !destinations.some((d) => d.screenId === id)
  )
    id = destinations[0]?.screenId || id;
  return doc.screens.find((s) => s.id === id);
}
export function screenQuery(
  doc,
  requestedId,
  screen,
  input = {},
  options = {},
) {
  // A layout-only Main screen opens its first tab using that tab's configured
  // defaults. An explicit incoming value still takes precedence.
  if (requestedId === doc.navigation?.screenId && requestedId !== screen.id) {
    const owner = doc.screens.find((s) => s.id === requestedId);
    const parameters = screenParameters(owner, input, options);
    const values =
      navigationDestinations(doc).find((d) => d.screenId === screen.id)
        ?.query || {};
    const defaults = {};
    for (const [key, value] of Object.entries(values)) {
      const match =
        typeof value === "string" &&
        value.match(
          /^\{\{\s*(params\.([a-zA-Z_][a-zA-Z0-9_]*)|auth\.user\.(id|name|email))\s*\}\}$/,
        );
      const resolved = match
        ? match[2]
          ? parameters[match[2]]
          : options.user?.[match[3]]
        : value;
      if (typeof value === "string" && value.includes("{{") && !match)
        throw Object.assign(
          new Error(
            "The first tab can use declared layout parameters or signed-in user fields. Choose one of those sources for its incoming values.",
          ),
          { statusCode: 400 },
        );
      if (resolved !== undefined) defaults[key] = resolved;
    }
    return {
      ...defaults,
      ...input,
    };
  }
  return input;
}
export function composeScreen(doc, screen) {
  const destinations = navigationDestinations(doc);
  const index = destinations.findIndex((d) => d.screenId === screen.id);
  if (index < 0) return screen.tree;
  const owner = doc.screens.find((s) => s.id === doc.navigation.screenId);
  const bar = {
    ...effective(navigationBar(doc)),
    selectedIndex: index,
    // Each remote screen owns its selection; discard a saved selection binding.
    bind: `_screenNavigation.${screen.id}`,
    destinations: destinations.map((d) => ({
      ...d,
      action: {
        type: "replace",
        source: `/runtime/screens/${d.screenId}`,
        query: d.query || {},
      },
    })),
  };
  const tree = effective(screen.tree);
  return tree.type === "scaffold" || tree.widgetType === "scaffold"
    ? { ...tree, props: undefined, style: undefined, bottomNavigationBar: bar }
    : {
        type: "scaffold",
        id: `shell_${screen.id}`,
        backgroundColor: effective(owner.tree).backgroundColor,
        body: screen.tree,
        bottomNavigationBar: bar,
      };
}
export function validateNavigation(doc) {
  if (!doc.navigation) return;
  const owner = doc.screens.find((s) => s.id === doc.navigation.screenId);
  const bar = navigationBar(doc);
  if (
    !owner ||
    !["scaffold"].includes(owner.tree.type || owner.tree.widgetType)
  )
    throw new Error(
      "Choose a screen with a Scaffold as the shared navigation layout.",
    );
  if (
    !["navigationBar", "bottomNavigationBar"].includes(
      bar?.type || bar?.widgetType,
    )
  )
    throw new Error("Add a bottom navigation bar to the shared layout screen.");
  const items = navigationDestinations(doc);
  if (!Array.isArray(items) || items.length < 2 || items.length > 5)
    throw new Error(
      "Shared bottom navigation needs between two and five items.",
    );
  const ids = items.map((d) => d.screenId);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !doc.screens.some((s) => s.id === id))
  )
    throw new Error(
      "Choose a different existing destination screen for every navigation item.",
    );
}
export function screenParameters(screen, input = {}, { preview = false } = {}) {
  try {
    const result = { ...input };
    for (const [name, field] of Object.entries(screen.parameters || {})) {
      let value =
        input[name] ??
        (preview ? field.sampleValue : undefined) ??
        field.defaultValue;
      if (value === undefined || value === null || value === "") {
        if (field.required && !preview)
          throw new Error(
            `Screen ${screen.name} needs the parameter “${name}”.`,
          );
        if (field.required && preview && value === undefined)
          value =
            field.type === "boolean"
              ? false
              : ["number", "integer"].includes(field.type)
                ? 0
                : "";
        if (value === undefined || value === null) delete result[name];
        else result[name] = value;
        continue;
      }
      if (Array.isArray(value) || typeof value === "object")
        throw new Error(
          `Parameter “${name}” must be a single ${field.type} value.`,
        );
      if (field.type === "boolean") {
        if (![true, false, "true", "false"].includes(value))
          throw new Error(`Parameter “${name}” must be true or false.`);
        value = value === true || value === "true";
      } else if (["number", "integer"].includes(field.type)) {
        value = Number(value);
        if (
          !Number.isFinite(value) ||
          (field.type === "integer" && !Number.isInteger(value))
        )
          throw new Error(`Parameter “${name}” must be a valid ${field.type}.`);
      } else value = String(value).slice(0, 2000);
      result[name] = value;
    }
    return result;
  } catch (error) {
    error.statusCode = 400;
    error.code = "SCREEN_PARAMETER_INVALID";
    throw error;
  }
}
