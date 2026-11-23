import React, { useState } from "react";

function SampleFields({ value, onChange, path = "", depth = 0 }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("text");
  return (
    <div className="preview-fields">
      {Object.entries(value).map(([key, field]) => {
        const full = path ? `${path}.${key}` : key;
        const set = (next) => onChange({ ...value, [key]: next });
        return (
          <div className="parameter-card" key={key}>
            <strong>{key}</strong>
            {field && typeof field === "object" ? (
              depth < 3 && (
                <SampleFields
                  value={Array.isArray(field) ? field[0] || {} : field}
                  path={full}
                  depth={depth + 1}
                  onChange={(next) => set(Array.isArray(field) ? [next] : next)}
                />
              )
            ) : (
              <label className="field">
                <span>Example value</span>
                {typeof field === "boolean" ? (
                  <select
                    aria-label={`Preview ${full}`}
                    value={String(field)}
                    onChange={(e) => set(e.target.value === "true")}
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    aria-label={`Preview ${full}`}
                    type={typeof field === "number" ? "number" : "text"}
                    value={field ?? ""}
                    onChange={(e) =>
                      set(
                        typeof field === "number"
                          ? Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                )}
              </label>
            )}
            <button
              className="text-link"
              onClick={() => {
                const next = { ...value };
                delete next[key];
                onChange(next);
              }}
            >
              Remove {key}
            </button>
          </div>
        );
      })}
      <label className="field">
        <span>{path ? `Field inside ${path}` : "Content name"}</span>
        <input
          aria-label={`New preview field${path ? ` in ${path}` : ""}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={path ? "message" : "welcome"}
        />
      </label>
      <label className="field">
        <span>Content type</span>
        <select
          aria-label={`Preview field type${path ? ` in ${path}` : ""}`}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="boolean">True / false</option>
          {depth < 3 && (
            <>
              <option value="record">Record with fields</option>
              <option value="list">List of records</option>
            </>
          )}
        </select>
      </label>
      <button
        className="secondary full"
        disabled={
          !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) ||
          [
            "__proto__",
            "constructor",
            "prototype",
            "auth",
            "capabilities",
            "params",
          ].includes(name) ||
          Object.hasOwn(value, name)
        }
        onClick={() => {
          onChange({
            ...value,
            [name]:
              type === "record"
                ? {}
                : type === "list"
                  ? [{}]
                  : type === "number"
                    ? 0
                    : type === "boolean"
                      ? true
                      : "",
          });
          setName("");
        }}
      >
        Add preview field
      </button>
    </div>
  );
}
export function PreviewContentEditor({ value = {}, onChange }) {
  return (
    <details className="preview-content-editor">
      <summary>Preview content for function results</summary>
      <p className="help-copy">
        If an action saves its result as “welcome”, add a record named welcome
        and example fields such as message. They appear in the layer field
        picker. Sample content uses these examples; the connected app receives
        the real result.
      </p>
      <SampleFields value={value} onChange={onChange} />
    </details>
  );
}
