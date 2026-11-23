/* Runs in Figma's plugin sandbox. No network access or Studio credentials. */
figma.showUI(__html__, { width: 400, height: 520, themeColors: true });
const EXPORT_LIMIT = 1500000;
let exporting = false,
  selectionVersion = 0;
function selectedRoots() {
  const selected = figma.currentPage.selection;
  return selected.filter((node) => {
    let parent = node.parent;
    while (parent) {
      if (selected.some((n) => n.id === parent.id)) return false;
      parent = parent.parent;
    }
    return node.visible !== false;
  });
}
function selectionInfo() {
  selectionVersion++;
  figma.ui.postMessage({
    type: "selection",
    count: selectedRoots().length,
    names: selectedRoots().map((n) => n.name),
  });
}
figma.on("selectionchange", selectionInfo);
selectionInfo();
function utf8Size(text) {
  let size = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    size += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  return size;
}
function bounds(node, rendered = false) {
  const box =
    (rendered ? node.absoluteRenderBounds : node.absoluteBoundingBox) ||
    node.absoluteBoundingBox;
  if (
    !box ||
    !Number.isFinite(box.width) ||
    box.width <= 0 ||
    !Number.isFinite(box.height) ||
    box.height <= 0
  )
    throw new Error(`“${node.name}” has no exportable bounds.`);
  if (
    box.width > 8192 ||
    box.height > 8192 ||
    box.width * box.height > 16000000
  )
    throw new Error(`“${node.name}” is too large. Select a smaller frame.`);
  return box;
}
function visiblePaints(value) {
  return Array.isArray(value)
    ? value.filter((p) => p.visible !== false && p.opacity !== 0)
    : [];
}
function hex(paint) {
  if (!paint) return undefined;
  const byte = (value) =>
    Math.round(Math.max(0, Math.min(1, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return (
    "#" +
    byte(paint.opacity === undefined ? 1 : paint.opacity) +
    byte(paint.color.r) +
    byte(paint.color.g) +
    byte(paint.color.b)
  );
}
function unsupported(node) {
  if (
    node.isMask ||
    (node.children && node.children.some((child) => child.isMask))
  )
    return "mask group";
  if (node.blendMode && !["NORMAL", "PASS_THROUGH"].includes(node.blendMode))
    return "blend mode";
  if (
    node.children &&
    node.children.some(
      (child) =>
        child.blendMode &&
        !["NORMAL", "PASS_THROUGH"].includes(child.blendMode),
    )
  )
    return "blended children";
  if (
    Array.isArray(node.effects) &&
    node.effects.some((effect) => effect.visible !== false)
  )
    return "shadow or effect";
  if (Math.abs(node.rotation || 0) > 0.001) return "rotation";
  if (
    node.relativeTransform &&
    (node.relativeTransform[0][0] < 0 || node.relativeTransform[1][1] < 0)
  )
    return "flipped layer";
  const fills = visiblePaints(node.fills),
    strokes = visiblePaints(node.strokes);
  if (
    (node.fills && !Array.isArray(node.fills)) ||
    fills.length > 1 ||
    fills.some((p) => p.type !== "SOLID")
  )
    return "image or complex fill";
  if (
    (node.strokes && !Array.isArray(node.strokes)) ||
    (strokes.length && typeof node.strokeWeight !== "number") ||
    strokes.length > 1 ||
    strokes.some((p) => p.type !== "SOLID") ||
    (strokes.length && node.strokeAlign !== "INSIDE")
  )
    return "complex stroke";
  if (strokes.length && node.type !== "RECTANGLE")
    return "stroke on a frame or text layer";
  if (
    node.cornerSmoothing > 0 ||
    (node.cornerRadius !== undefined && typeof node.cornerRadius !== "number")
  )
    return "custom corners";
  if (Array.isArray(node.dashPattern) && node.dashPattern.length)
    return "dashed stroke";
  if (
    [
      "VECTOR",
      "BOOLEAN_OPERATION",
      "ELLIPSE",
      "POLYGON",
      "STAR",
      "LINE",
    ].includes(node.type)
  )
    return "vector artwork";
  if (node.type === "TEXT") {
    if (
      typeof node.fontSize !== "number" ||
      typeof node.fontName !== "object" ||
      typeof node.fontName.family !== "string" ||
      typeof node.fontWeight !== "number"
    )
      return "mixed text styles";
    if (
      (node.textAlignVertical && node.textAlignVertical !== "TOP") ||
      (node.textDecoration && typeof node.textDecoration !== "string") ||
      node.fontWeight % 100 !== 0 ||
      node.hasMissingFont ||
      node.paragraphSpacing ||
      node.paragraphIndent ||
      (node.textCase && node.textCase !== "ORIGINAL")
    )
      return "advanced text layout";
    if (
      typeof node.lineHeight !== "object" ||
      typeof node.letterSpacing !== "object"
    )
      return "mixed text spacing";
  }
  if (
    ![
      "FRAME",
      "GROUP",
      "COMPONENT",
      "INSTANCE",
      "RECTANGLE",
      "TEXT",
      "SECTION",
    ].includes(node.type)
  )
    return "unsupported layer";
  return null;
}
async function buildExport(nodes, snapshotOnly) {
  const warnings = [],
    fonts = new Set(),
    imageCache = new Map();
  let count = 0;
  async function png(node, full) {
    const key = `${node.id}:${full}`;
    if (imageCache.has(key)) return imageCache.get(key);
    const bytes = await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: 1 },
      contentsOnly: true,
      useAbsoluteBounds: full,
      colorProfile: "SRGB",
    });
    if (bytes.length > EXPORT_LIMIT * 0.75)
      throw new Error(
        `“${node.name}” has a large image. Select a smaller frame or simplify its images.`,
      );
    const source = "data:image/png;base64," + figma.base64Encode(bytes);
    imageCache.set(key, source);
    return source;
  }
  async function visit(node, parent, depth) {
    if (++count > 500 || depth > 24)
      throw new Error(
        "Copy a smaller selection (maximum 500 layers and 24 nested levels).",
      );
    const box = bounds(node),
      reason = unsupported(node);
    const base = {
      name: node.name,
      x: box.x - parent.x,
      y: box.y - parent.y,
      width: box.width,
      height: box.height,
    };
    if (reason) {
      const visual = bounds(node, true);
      warnings.push(`${node.name}: ${reason}; preserved as an image.`);
      return {
        ...base,
        kind: "raster",
        x: visual.x - parent.x,
        y: visual.y - parent.y,
        width: visual.width,
        height: visual.height,
        src: await png(node, false),
      };
    }
    const fill = visiblePaints(node.fills)[0],
      stroke = visiblePaints(node.strokes)[0];
    const style = {
      opacity: node.opacity === undefined ? 1 : node.opacity,
      fill: hex(fill) || (node.type === "TEXT" ? "#00000000" : undefined),
      radius: typeof node.cornerRadius === "number" ? node.cornerRadius : 0,
      borderColor: hex(stroke),
      borderWidth: stroke ? node.strokeWeight : undefined,
    };
    if (node.type === "TEXT") {
      fonts.add(node.fontName.family);
      return {
        ...base,
        ...style,
        kind: "text",
        text: node.characters,
        fontFamily: node.fontName.family,
        fontSize: node.fontSize,
        fontWeight: node.fontWeight,
        italic: /italic|oblique/i.test(node.fontName.style),
        textAlign:
          {
            LEFT: "left",
            CENTER: "center",
            RIGHT: "right",
            JUSTIFIED: "justify",
          }[node.textAlignHorizontal] || "left",
        decoration: { UNDERLINE: "underline", STRIKETHROUGH: "lineThrough" }[
          node.textDecoration
        ],
        lineHeight:
          node.lineHeight.unit === "PIXELS"
            ? node.lineHeight.value / node.fontSize
            : node.lineHeight.unit === "PERCENT"
              ? node.lineHeight.value / 100
              : undefined,
        letterSpacing:
          node.letterSpacing.unit === "PERCENT"
            ? (node.fontSize * node.letterSpacing.value) / 100
            : node.letterSpacing.value,
      };
    }
    if (node.type === "RECTANGLE") return { ...base, ...style, kind: "box" };
    const children = [];
    const visible = (node.children || []).filter(
      (child) => child.visible !== false && child.opacity !== 0,
    );
    if (node.itemReverseZIndex) visible.reverse();
    for (const child of visible)
      children.push(await visit(child, box, depth + 1));
    return {
      ...base,
      ...style,
      kind: "frame",
      clip: node.clipsContent === true,
      children,
    };
  }
  const frames = [];
  for (const node of nodes) {
    const box = bounds(node);
    const preview = await png(node, true);
    frames.push({
      name: node.name,
      width: box.width,
      height: box.height,
      preview,
      root: snapshotOnly ? undefined : await visit(node, box, 0),
    });
  }
  if (fonts.size)
    warnings.push(
      "Editable text needs the same fonts in your Flutter app. Font metrics can differ; use Visual snapshot for the exported appearance.",
    );
  const payload = { format: "spacewidget-figma", version: 1, frames, warnings };
  const text = JSON.stringify(payload);
  if (utf8Size(text) > EXPORT_LIMIT)
    throw new Error(
      "Selection exceeds 1.5 MB. Export Visual snapshot only, or select one smaller frame.",
    );
  return {
    text,
    preview: frames[0].preview,
    frames: frames.length,
    layers: count,
    warnings,
  };
}
figma.ui.onmessage = async (message) => {
  if (message.type !== "export" || exporting) return;
  exporting = true;
  try {
    const selection = selectedRoots();
    if (!selection.length || selection.length > 10)
      throw new Error("Select between 1 and 10 frames or layers in Figma.");
    figma.ui.postMessage({ type: "progress" });
    const version = selectionVersion;
    const result = await buildExport(selection, message.snapshotOnly === true);
    if (version !== selectionVersion)
      throw new Error(
        "The Figma selection changed. Export the new selection again.",
      );
    figma.ui.postMessage({ type: "exported", ...result });
  } catch (error) {
    figma.ui.postMessage({
      type: "error",
      message: error.message || "Unable to export this selection.",
    });
  } finally {
    exporting = false;
  }
};
