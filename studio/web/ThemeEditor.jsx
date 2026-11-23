import React, { useState } from "react";
import { colorSwatch, applyColorSwatch } from "./designer-model.js";
export const DEFAULT_THEME = { seedColor: "#7763e8", themeMode: "light" };
const colors = {
  primaryColor: "Primary",
  onPrimaryColor: "Text on primary",
  secondaryColor: "Secondary",
  onSecondaryColor: "Text on secondary",
  backgroundColor: "Scaffold background",
  surfaceColor: "Surface",
  onSurfaceColor: "Text on surface",
  errorColor: "Error",
  onErrorColor: "Text on error",
};
function ColorFields({ value, onChange, prefix = "" }) {
  return (
    <div className="theme-color-grid">
      {Object.entries(colors).map(([key, label]) => (
        <label className="field" key={key}>
          <span>
            {prefix}
            {label}
          </span>
          <div className="theme-color-input">
            <input
              aria-label={`${prefix}${label} picker`}
              type="color"
              value={colorSwatch(value[key])}
              onChange={(e) =>
                onChange({
                  ...value,
                  [key]: applyColorSwatch(value[key], e.target.value),
                })
              }
            />
            <input
              aria-label={`${prefix}${label}`}
              value={
                typeof value[key] === "number"
                  ? `#${(value[key] >>> 0).toString(16).padStart(8, "0")}`
                  : value[key] || ""
              }
              placeholder="Automatic from seed"
              pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?"
              onChange={(e) =>
                onChange({ ...value, [key]: e.target.value || undefined })
              }
            />
          </div>
        </label>
      ))}
    </div>
  );
}
export function ThemeEditor({
  value = {},
  onSubmit,
  busy,
  creating = false,
  name,
  onName,
}) {
  const [config, setConfig] = useState(() => structuredClone(value));
  const [error, setError] = useState("");
  const patch = (values) => setConfig((c) => ({ ...c, ...values }));
  async function fonts(files) {
    try {
      if (!config.fontFamily?.trim())
        throw new Error(
          "Enter the custom font family name before adding files.",
        );
      const existing = config.fonts || [],
        all = [...existing];
      for (const file of files) {
        if (!/\.(ttf|otf)$/i.test(file.name))
          throw new Error("Choose TTF or OTF font files.");
        if (file.size > 2 * 1024 * 1024)
          throw new Error("Each font file must be under 2 MB.");
        const data = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(new Error("Unable to read font file."));
          r.readAsDataURL(file);
        });
        all.push({ family: config.fontFamily.trim(), name: file.name, data });
      }
      if (all.length > 12 || JSON.stringify(all).length > 6 * 1024 * 1024)
        throw new Error(
          "Use up to 12 font files, with a combined size under 4 MB.",
        );
      patch({ fonts: all });
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <form
      className="theme-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...config,
          fontFamily: config.fontFamily?.trim() || undefined,
        });
      }}
    >
      {creating && (
        <label className="field">
          <span>Name</span>
          <input
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="My next app"
          />
        </label>
      )}
      <p className="help-copy">
        This app theme is used by the Flutter preview and the hosted app.
        Publish your theme and screens together. Individual widget overrides
        take priority.
      </p>
      <div className="theme-color-input">
        <label className="field">
          <span>Seed color</span>
          <input
            aria-label="Seed color"
            type="color"
            value={colorSwatch(config.seedColor || "#7763e8")}
            onChange={(e) => patch({ seedColor: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Appearance</span>
          <select
            value={config.themeMode || "light"}
            onChange={(e) => patch({ themeMode: e.target.value })}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="system">Follow device</option>
          </select>
        </label>
      </div>
      <h3>App colors</h3>
      <ColorFields value={config} onChange={setConfig} />
      <details>
        <summary>Dark appearance colors</summary>
        <p className="help-copy">
          Automatic colors are generated for dark mode. Set overrides here when
          needed.
        </p>
        <ColorFields
          prefix="Dark "
          value={config.darkTheme || {}}
          onChange={(darkTheme) => patch({ darkTheme })}
        />
      </details>
      <h3>Typography & shape</h3>
      <div className="theme-color-grid">
        <label className="field">
          <span>Font family</span>
          <input
            value={config.fontFamily || ""}
            placeholder="Platform default"
            onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          <span>Body font size</span>
          <input
            type="number"
            min={8}
            max={48}
            value={config.fontSize ?? ""}
            placeholder="14"
            onChange={(e) =>
              patch({
                fontSize: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
        <label className="field">
          <span>Corner radius</span>
          <input
            type="number"
            min={0}
            max={64}
            value={config.borderRadius ?? ""}
            placeholder="Material default"
            onChange={(e) =>
              patch({
                borderRadius: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </label>
      </div>
      {config.fontFamily &&
        !(config.fonts || []).some(
          (font) => font.family === config.fontFamily.trim(),
        ) && (
          <p className="help-copy">
            Upload this font for consistent rendering. A family name alone
            requires the font to be bundled in both Studio and your Flutter app.
          </p>
        )}
      <label className="field">
        <span>Add custom font files</span>
        <input
          aria-label="Add custom font files"
          type="file"
          multiple
          accept=".ttf,.otf"
          onChange={(e) => {
            fonts([...e.target.files]);
            e.target.value = "";
          }}
        />
        <small>
          Upload regular, bold and italic files for the family above. Font
          metadata supplies their weights and styles. The same files travel with
          the published theme.
        </small>
      </label>
      {(config.fonts || []).map((font, i) => (
        <div className="theme-font-row" key={i}>
          <span>
            {font.family} · {font.name}
          </span>
          <button
            type="button"
            className="text-link"
            aria-label={`Remove font ${font.name}`}
            onClick={() =>
              patch({ fonts: config.fonts.filter((_, j) => i !== j) })
            }
          >
            Remove
          </button>
        </div>
      ))}
      {error && (
        <p role="alert" className="property-error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {creating ? "Create app" : "Apply theme to draft"}
      </button>
    </form>
  );
}
