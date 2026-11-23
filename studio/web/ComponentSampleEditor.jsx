import React from "react";
import { componentItemFields } from "../shared/component-preview.mjs";
export function ComponentSampleEditor({ component, onChange }) {
  const fields = [...componentItemFields(component)];
  if (!fields.length) return null;
  return (
    <details className="component-sample-editor">
      <summary>Preview record</summary>
      <p className="help-copy">
        Example values for this component’s current record. These only affect
        the editing canvas; the app uses its connected records.
      </p>
      {fields.map(([name, type]) => (
        <label className="field" key={name}>
          <span>{name.replace(/([A-Z])/g, " $1")}</span>
          {type === "boolean" ? (
            <select
              aria-label={`Preview ${name}`}
              value={String(component.previewData?.item?.[name] ?? true)}
              onChange={(e) =>
                onChange({
                  ...component.previewData,
                  item: {
                    ...component.previewData?.item,
                    [name]: e.target.value === "true",
                  },
                })
              }
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input
              aria-label={`Preview ${name}`}
              value={component.previewData?.item?.[name] ?? ""}
              placeholder="Automatic sample"
              onChange={(e) =>
                onChange({
                  ...component.previewData,
                  item: {
                    ...component.previewData?.item,
                    [name]: e.target.value,
                  },
                })
              }
            />
          )}
        </label>
      ))}
    </details>
  );
}
