import { uid, slug, clone, insertInto } from "./model.js";

export const FIGMA_FORMAT = "spacewidget-figma";
export const FIGMA_MAX_BYTES = 1_500_000;
const MAX_NODES = 500;
const finite = (value, label, min = -32768, max = 32768) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  return value;
};
const label = (value) =>
  typeof value === "string" ? value.slice(0, 200) : "Figma layer";
const color = (value) => {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "string" ||
    !/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
  )
    throw new Error("Invalid layer color.");
  return value;
};
export function pngDimensions(source) {
  if (
    typeof source !== "string" ||
    source.length > FIGMA_MAX_BYTES ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source)
  )
    throw new Error("Import images must be embedded PNG data.");
  let bytes;
  try {
    bytes = atob(source.slice(22));
  } catch {
    throw new Error("Invalid PNG encoding.");
  }
  if (
    bytes.length < 33 ||
    !bytes.startsWith("\x89PNG\r\n\x1a\n") ||
    bytes.slice(12, 16) !== "IHDR"
  )
    throw new Error("Invalid PNG image.");
  const integer = (offset) =>
    Array.from(bytes.slice(offset, offset + 4)).reduce(
      (v, c) => v * 256 + c.charCodeAt(0),
      0,
    );
  const width = integer(16),
    height = integer(20);
  if (
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16_000_000
  )
    throw new Error("PNG exceeds the 16 megapixel import limit.");
  return { width, height };
}
export function parseFigmaPackage(input) {
  const text = typeof input === "string" ? input : JSON.stringify(input);
  if (new TextEncoder().encode(text).length > FIGMA_MAX_BYTES)
    throw new Error(
      "This selection is too large. Copy one smaller frame (maximum 1.5 MB).",
    );
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "Copy the selection with the SpaceWidget Figma plugin, or import its JSON file.",
    );
  }
  if (
    !value ||
    value.format !== FIGMA_FORMAT ||
    value.version !== 1 ||
    !Array.isArray(value.frames) ||
    !value.frames.length ||
    value.frames.length > 10
  )
    throw new Error("This is not a supported SpaceWidget Figma export.");
  let count = 0,
    pixels = 0;
  const imageCache = new Set(),
    fonts = new Set();
  const image = (src) => {
    const size = pngDimensions(src);
    if (!imageCache.has(src)) {
      pixels += size.width * size.height;
      imageCache.add(src);
    }
    if (pixels > 32_000_000 || imageCache.size > 64)
      throw new Error(
        "Too many imported image pixels. Copy a smaller selection.",
      );
    return src;
  };
  const visit = (node, depth = 0) => {
    if (
      !node ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      ++count > MAX_NODES ||
      depth > 24
    )
      throw new Error(
        "Selection exceeds the layer/depth limit (500 layers, 24 levels).",
      );
    if (!["frame", "box", "text", "raster"].includes(node.kind))
      throw new Error("Unsupported exported layer type.");
    const out = {
      kind: node.kind,
      name: label(node.name),
      x: finite(node.x ?? 0, "Layer x"),
      y: finite(node.y ?? 0, "Layer y"),
      width: finite(node.width, "Layer width", 0.01, 8192),
      height: finite(node.height, "Layer height", 0.01, 8192),
    };
    if (node.opacity !== undefined)
      out.opacity = finite(node.opacity, "Opacity", 0, 1);
    if (node.fill !== undefined) out.fill = color(node.fill);
    if (node.radius !== undefined)
      out.radius = finite(node.radius, "Corner radius", 0, 8192);
    if (node.borderColor !== undefined)
      out.borderColor = color(node.borderColor);
    if (node.borderWidth !== undefined)
      out.borderWidth = finite(node.borderWidth, "Border width", 0, 1024);
    if (node.kind === "raster") out.src = image(node.src);
    if (node.kind === "text") {
      if (typeof node.text !== "string" || node.text.length > 50000)
        throw new Error("Invalid imported text.");
      out.text = node.text;
      out.fontSize = finite(node.fontSize ?? 16, "Font size", 1, 2048);
      out.fontWeight =
        Math.round(
          finite(node.fontWeight ?? 400, "Font weight", 100, 900) / 100,
        ) * 100;
      if (
        typeof node.fontFamily === "string" &&
        node.fontFamily.length <= 100
      ) {
        out.fontFamily = node.fontFamily;
        fonts.add(node.fontFamily);
      }
      out.textAlign = ["left", "center", "right", "justify"].includes(
        node.textAlign,
      )
        ? node.textAlign
        : "left";
      out.italic = node.italic === true;
      if (["underline", "lineThrough"].includes(node.decoration))
        out.decoration = node.decoration;
      if (node.lineHeight !== undefined)
        out.lineHeight = finite(node.lineHeight, "Line height", 0.01, 20);
      if (node.letterSpacing !== undefined)
        out.letterSpacing = finite(
          node.letterSpacing,
          "Letter spacing",
          -2048,
          2048,
        );
    }
    if (node.kind === "frame") {
      if (!Array.isArray(node.children))
        throw new Error("A frame needs a child layer list.");
      out.clip = node.clip === true;
      out.children = node.children.map((child) => visit(child, depth + 1));
    }
    return out;
  };
  const frames = value.frames.map((frame) => ({
    name: label(frame.name),
    width: finite(frame.width, "Frame width", 1, 8192),
    height: finite(frame.height, "Frame height", 1, 8192),
    preview: frame.preview ? image(frame.preview) : undefined,
    root: frame.root ? visit(frame.root) : undefined,
  }));
  if (frames.some((frame) => !frame.root && !frame.preview))
    throw new Error("The export has no design layers or snapshot.");
  return {
    format: FIGMA_FORMAT,
    version: 1,
    frames,
    fonts: [...fonts],
    layerCount: count,
    warnings: Array.isArray(value.warnings)
      ? value.warnings
          .slice(0, 100)
          .map((w) => label(typeof w === "string" ? w : w?.message))
      : [],
  };
}
export function classifyFigmaClipboard(text = "", html = "") {
  if (
    text.trim().startsWith("{") &&
    /"format"\s*:\s*"spacewidget-figma"/.test(text)
  )
    return "package";
  if (
    /figmeta|figma\)|data-metadata=.*figma|data-buffer=.*figma|<!--\(figma/i.test(
      html,
    ) ||
    /^https:\/\/(?:www\.)?figma\.com\/(?:design|file|board)\//i.test(
      text.trim(),
    )
  )
    return "native";
  return null;
}
export function snapshotPackage(source, name = "Pasted design") {
  const { width, height } = pngDimensions(source);
  return {
    format: FIGMA_FORMAT,
    version: 1,
    frames: [{ name, width, height, preview: source }],
    warnings: [],
  };
}
function layerWidget(node) {
  const base = { id: uid(), labelName: node.name };
  let widget;
  if (node.kind === "raster")
    widget = {
      ...base,
      type: "image",
      src: node.src,
      width: node.width,
      height: node.height,
      fit: "fill",
      semanticLabel: node.name,
    };
  else if (node.kind === "text")
    widget = {
      ...base,
      type: "text",
      text: node.text,
      literal: true,
      fontSize: node.fontSize,
      fontWeight: node.fontWeight,
      fontFamily: node.fontFamily,
      color: node.fill ?? "#000000",
      textAlign: node.textAlign,
      italic: node.italic,
      decoration: node.decoration,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
    };
  else {
    widget = {
      ...base,
      type: "container",
      width: node.width,
      height: node.height,
      backgroundColor: node.fill,
      borderRadius: node.radius,
      borderColor: node.borderColor,
      borderWidth: node.borderWidth,
    };
    if (node.kind === "frame")
      widget.child = {
        type: "stack",
        id: uid(),
        clip: node.clip,
        alignment: "topLeft",
        children: node.children.map((child) => ({
          type: "positioned",
          id: uid(),
          labelName: `${child.name} position`,
          left: child.x,
          top: child.y,
          width: child.width,
          height: child.height,
          child: layerWidget(child),
        })),
      };
    if (node.clip && node.radius)
      widget = {
        type: "clipRRect",
        id: uid(),
        borderRadius: node.radius,
        child: widget,
      };
  }
  if (node.opacity !== undefined && node.opacity !== 1)
    widget = {
      type: "opacity",
      id: uid(),
      opacity: node.opacity,
      child: widget,
    };
  return widget;
}
export function figmaFrameTree(frame, mode = "editable") {
  let content;
  if (mode === "snapshot") {
    if (!frame.preview)
      throw new Error(
        "This export has no visual snapshot. Export it again with the Figma plugin.",
      );
    content = {
      type: "image",
      id: uid(),
      labelName: `${frame.name} · visual snapshot`,
      semanticLabel: frame.name,
      src: frame.preview,
      width: frame.width,
      height: frame.height,
      fit: "fill",
    };
  } else {
    if (!frame.root)
      throw new Error(
        "This clipboard image has no editable layers. Choose Visual snapshot.",
      );
    content = {
      type: "stack",
      id: uid(),
      clip: true,
      alignment: "topLeft",
      children: [
        {
          type: "positioned",
          id: uid(),
          left: frame.root.x,
          top: frame.root.y,
          width: frame.root.width,
          height: frame.root.height,
          child: layerWidget(frame.root),
        },
      ],
    };
  }
  return JSON.parse(
    JSON.stringify({
      type: "sizedBox",
      id: uid(),
      labelName: frame.name,
      width: frame.width,
      height: frame.height,
      child: content,
    }),
  );
}
export function applyFigmaImport(
  document,
  exported,
  {
    frameIndex = 0,
    mode = "editable",
    destination = "screen",
    name,
    screenId,
    componentId,
    selected,
  } = {},
) {
  const parsed = parseFigmaPackage(exported),
    frame = parsed.frames[frameIndex];
  if (!frame) throw new Error("Select a frame to import.");
  const doc = clone(document),
    tree = figmaFrameTree(frame, mode),
    displayName = (name || frame.name).trim().slice(0, 100);
  if (!displayName) throw new Error("Give the imported design a name.");
  const uniqueId = (collection) => {
    const base = slug(displayName).replace(/^[^a-z]+/, "") || "figma-design";
    let id = base,
      index = 2;
    while (collection.some((v) => v.id === id))
      id = `${base.slice(0, 55)}-${index++}`;
    return id;
  };
  let entityId = screenId;
  if (destination === "screen") {
    if (doc.screens.length >= 100)
      throw new Error("This app already has 100 screens.");
    entityId = uniqueId(doc.screens);
    doc.screens.push({
      id: entityId,
      name: displayName,
      public: false,
      state: {},
      queries: [],
      tree: {
        type: "scaffold",
        id: uid(),
        backgroundColor: "#FFFFFF",
        body: { type: "singleChildScrollView", id: uid(), child: tree },
      },
    });
  } else if (destination === "component") {
    if (doc.components.length >= 200)
      throw new Error("This app already has 200 components.");
    entityId = uniqueId(doc.components);
    doc.components.push({
      id: entityId,
      name: displayName,
      defaults: {},
      tree,
    });
  } else {
    const target = componentId
      ? doc.components.find((c) => c.id === componentId)
      : doc.screens.find((s) => s.id === screenId);
    if (!target) throw new Error("Choose a screen or component first.");
    if (destination === "replace")
      target.tree = componentId
        ? tree
        : {
            type: "scaffold",
            id: uid(),
            backgroundColor: "#FFFFFF",
            body: { type: "singleChildScrollView", id: uid(), child: tree },
          };
    else if (destination === "insert")
      target.tree = insertInto(target.tree, selected, tree);
    else throw new Error("Unknown import destination.");
  }
  // Positioned layers add wrappers. Check the actual generated trees against
  // Studio's rendering budget before changing the draft, including insertion
  // into an already deeply nested layout.
  for (const entity of [...doc.screens, ...doc.components]) {
    let count = 0;
    const visit = (value, depth = 0) => {
      if (++count > 10000 || depth > 64)
        throw new Error(
          "The imported layout exceeds Studio’s rendering limit. Select fewer layers or use Visual snapshot.",
        );
      if (Array.isArray(value))
        value.forEach((child) => visit(child, depth + 1));
      else if (value && typeof value === "object")
        Object.values(value).forEach((child) => visit(child, depth + 1));
    };
    visit(entity.tree);
  }
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 1_900_000)
    throw new Error(
      "This import exceeds the app document size limit. Use a smaller selection or fewer embedded images.",
    );
  return {
    document: doc,
    entityId,
    nodeId: tree.id,
    width: frame.width,
    height: frame.height,
    destination,
  };
}
