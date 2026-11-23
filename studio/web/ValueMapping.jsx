import React, { useEffect, useState, useContext, createContext } from "react";

export const MappingContext = createContext([]);

// A compact mapping control shared by navigation and request steps. Designers
// choose sources; the persisted runtime expression is an implementation detail.
export function ValueInput({
  label,
  value,
  onChange,
  parameters = {},
  server = false,
  fixedOnly = false,
}) {
  const available = useContext(MappingContext);
  const binding = typeof value === "string" && value.match(/^\{\{(.+)\}\}$/);
  const [mode, setMode] = useState(() =>
    binding
      ? "binding"
      : typeof value === "number"
        ? "number"
        : typeof value === "boolean"
          ? "boolean"
          : "text",
  );
  const actual = server && value && typeof value === "object" ? value : null;
  useEffect(() => {
    setMode(
      binding || actual
        ? "binding"
        : typeof value === "number"
          ? "number"
          : typeof value === "boolean"
            ? "boolean"
            : "text",
    );
  }, [value]);
  const source = actual
    ? actual.from === "auth"
      ? `auth.user.${actual.key}`
      : `params.${actual.key}`
    : binding?.[1] || "";
  const candidates = [
    ...(!server ? available : []),
    ...Object.entries(parameters).map(([key, field]) => [
      `params.${key}`,
      `Screen parameter · ${field.description || key}`,
    ]),
    ["auth.user.id", "Signed-in user · ID"],
    ["auth.user.name", "Signed-in user · Name"],
    ["auth.user.email", "Signed-in user · Email"],
    ...(!server
      ? [
          ...(available.some(
            ([path]) => path === "item" || path.startsWith("item."),
          )
            ? [["item", "Current record · Entire record"]]
            : []),
          ["response", "Previous response · All fields"],
        ]
      : []),
  ];
  const options = [
    ...new Map(candidates.map((entry) => [entry[0], entry])).values(),
  ];
  const mapped = actual || binding || mode === "binding";
  const choose = (path) =>
    onChange(
      server
        ? {
            from: path.startsWith("auth.") ? "auth" : "query",
            key: path.replace(/^auth\.user\.|^params\./, ""),
          }
        : `{{${path}}}`,
    );
  return (
    <div className="mapping-value">
      <label className="field">
        <span>{label} source</span>
        <select
          aria-label={`${label} source`}
          value={mapped ? "binding" : mode}
          onChange={(e) => {
            setMode(e.target.value);
            if (e.target.value === "binding")
              choose(options[0]?.[0] || "item.id");
            else
              onChange(
                e.target.value === "number"
                  ? 0
                  : e.target.value === "boolean"
                    ? false
                    : "",
              );
          }}
        >
          <option value="text">Fixed text</option>
          <option value="number">Fixed number</option>
          <option value="boolean">True / false</option>
          {!fixedOnly && <option value="binding">Choose a data field</option>}
        </select>
      </label>
      {mapped ? (
        <>
          <label className="field">
            <span>{label} field</span>
            <select
              aria-label={`${label} field`}
              value={source}
              onChange={(e) => choose(e.target.value)}
            >
              {!options.some(([key]) => key === source) && (
                <option value={source}>{source || "Choose field"}</option>
              )}
              {options.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <details>
            <summary>Another data field</summary>
            <input
              aria-label={`${label} custom field`}
              value={source}
              onChange={(e) => choose(e.target.value)}
              placeholder={server ? "params.productId" : "item.productId"}
            />
          </details>
        </>
      ) : (
        <label className="field">
          <span>{label}</span>
          {mode === "boolean" ? (
            <select
              aria-label={label}
              value={String(value ?? false)}
              onChange={(e) => onChange(e.target.value === "true")}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              aria-label={label}
              type={mode === "number" ? "number" : "text"}
              value={value ?? ""}
              onChange={(e) =>
                onChange(
                  mode === "number" ? Number(e.target.value) : e.target.value,
                )
              }
            />
          )}
        </label>
      )}
    </div>
  );
}
export function MappingEditor({
  label,
  value = {},
  onChange,
  parameters,
  definitions,
  server = false,
  emptyMessage,
  suggested,
  fixedOnly = false,
}) {
  const [name, setName] = useState("");
  value ||= {};
  const entries = [
    ...new Set([
      ...(definitions ? Object.keys(definitions) : []),
      ...Object.keys(value),
    ]),
  ];
  return (
    <div className="mapping-editor">
      <h4>{label}</h4>
      {entries.map((key) => (
        <div className="mapping-row" key={key}>
          <strong>
            {key}
            {definitions?.[key]?.required ? " · Required" : ""}
          </strong>
          {definitions?.[key]?.description && (
            <small>{definitions[key].description}</small>
          )}
          {value[key] === undefined ? (
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange({
                  ...value,
                  [key]:
                    definitions?.[key]?.type === "boolean"
                      ? false
                      : ["number", "integer"].includes(definitions?.[key]?.type)
                        ? 0
                        : "",
                })
              }
            >
              Pass {key}
            </button>
          ) : (
            <>
              <ValueInput
                label={key}
                value={value[key]}
                onChange={(v) => onChange({ ...value, [key]: v })}
                parameters={parameters}
                server={server}
                fixedOnly={fixedOnly}
              />
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  const next = { ...value };
                  delete next[key];
                  onChange(next);
                }}
              >
                Remove value
              </button>
            </>
          )}
          {value[key] === undefined && suggested === "form" && (
            <small>
              Submitted automatically when the form has an input named {key}.
              Add a value here to override it.
            </small>
          )}
        </div>
      ))}
      {!definitions && (
        <div className="mapping-add">
          <label className="field">
            <span>New {label.toLowerCase()} field</span>
            <input
              aria-label={`New ${label.toLowerCase()} field`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="For example productId"
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={
              !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
              ["__proto__", "constructor", "prototype"].includes(name) ||
              Object.hasOwn(value, name)
            }
            onClick={() => {
              onChange({ ...value, [name]: "" });
              setName("");
            }}
          >
            Add field
          </button>
        </div>
      )}
      {!entries.length && (
        <p className="help-copy">
          {emptyMessage ||
            (definitions
              ? "This screen does not require incoming values."
              : "Add named values and choose where each one comes from.")}
        </p>
      )}
    </div>
  );
}
