import { widgetCatalog, widgetType } from "./widget-catalog.js";
export const binding = (value) =>
  typeof value === "string" && /^\{\{\s*[^{}]+\s*\}\}$/.test(value);
export function parseProperty(text, field) {
  if (text === "") return undefined;
  if (binding(text) && !["name", "bind", "positionBind"].includes(field.key))
    return text;
  let value;
  if (field.kind === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
    throw new Error("Use true, false, or a {{data.binding}}.");
  }
  if (field.kind === "number") {
    value = Number(text);
    if (!text.trim() || !Number.isFinite(value))
      throw new Error("Enter a finite number or a {{data.binding}}.");
    if (field.integer && !Number.isInteger(value))
      throw new Error("Enter a whole number.");
    if (field.min !== undefined && value < field.min)
      throw new Error(`Minimum: ${field.min}.`);
    if (field.max !== undefined && value > field.max)
      throw new Error(`Maximum: ${field.max}.`);
    if (
      field.key === "fontWeight" &&
      ![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(value)
    )
      throw new Error("Use a font weight from 100 to 900 in steps of 100.");
    return value;
  }
  if (field.kind === "color") {
    if (
      /^@theme\.(primary|onPrimary|secondary|onSecondary|surface|onSurface|error|onError|background)$/.test(
        text,
      )
    )
      return text;
    if (
      !/^(?:#[0-9a-f]{3}|#?(?:[0-9a-f]{6}|[0-9a-f]{8})|0x[0-9a-f]{8}|transparent|black|white|red|green|blue|grey|orange|purple|teal)$/i.test(
        text,
      )
    )
      throw new Error(
        "Use a hex color, a supported color name, or a data binding.",
      );
    return text;
  }
  if (
    ["json", "array", "insets", "action", "widget", "widgets"].includes(
      field.kind,
    )
  ) {
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("Enter valid JSON or a {{data.binding}}.");
    }
    if (
      field.numeric &&
      (!Array.isArray(value) ||
        value.some(
          (item) => typeof item !== "number" || !Number.isFinite(item),
        ))
    )
      throw new Error("Enter an array of numbers.");
    if (["array", "widgets"].includes(field.kind) && !Array.isArray(value))
      throw new Error("Enter a JSON array.");
    if (
      field.kind === "widget" &&
      (!value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        !widgetCatalog[widgetType(value)])
    )
      throw new Error("Enter a widget object with a supported type.");
    if (
      field.kind === "action" &&
      (value === null || typeof value !== "object")
    )
      throw new Error("Enter an action object or action list.");
    if (field.kind === "insets") {
      const valid =
        typeof value === "number"
          ? Number.isFinite(value) && value >= 0
          : value &&
            !Array.isArray(value) &&
            typeof value === "object" &&
            Object.entries(value).every(
              ([k, v]) =>
                [
                  "horizontal",
                  "vertical",
                  "top",
                  "bottom",
                  "left",
                  "right",
                ].includes(k) &&
                typeof v === "number" &&
                v >= 0,
            );
      if (!valid)
        throw new Error(
          "Use a nonnegative number or an object of nonnegative inset values.",
        );
    }
    return value;
  }
  return text;
}
