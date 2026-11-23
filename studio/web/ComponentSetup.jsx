import React from "react";
import { ComponentValues } from "./WidgetProperties.jsx";
import { ComponentSampleEditor } from "./ComponentSampleEditor.jsx";
import { componentUsage } from "../shared/authoring.mjs";

export function ComponentSetup({
  doc,
  component,
  section,
  change,
  onSelect,
  onTechnical,
  onOpenScreen,
  onOpenComponent,
}) {
  const patch = (values) =>
    change((d) =>
      Object.assign(
        d.components.find((c) => c.id === component.id),
        values,
      ),
    );
  const instances = componentUsage(doc, component.id);
  if (section === "actions")
    return (
      <section className="inspector-section">
        <h3>Component interactions</h3>
        <p className="help-copy">
          Select a button or interactive layer inside the component to choose
          its trigger and steps. Each screen instance uses the same design.
        </p>
        <button
          className="secondary full"
          onClick={() => onSelect(component.tree.id)}
        >
          Select component contents
        </button>
      </section>
    );
  return (
    <section className="inspector-section">
      <h3>{section === "data" ? "Reusable content" : "Component setup"}</h3>
      {section !== "data" && (
        <label className="field">
          <span>Component name</span>
          <input
            aria-label="Component name"
            value={component.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
      )}
      <p className="help-copy">
        Add properties below. Select a layer, open Content and choose a
        Component property. Each instance can supply its own value without
        changing this design.
      </p>
      <ComponentValues
        editable
        designer
        defaults={component.defaults}
        values={component.defaults}
        onChange={(defaults) => patch({ defaults })}
      />
      <ComponentSampleEditor
        component={component}
        onChange={(previewData) => patch({ previewData })}
      />
      {!!instances.length && (
        <div className="component-usage">
          <h4>
            Used in {instances.length} design{instances.length === 1 ? "" : "s"}
          </h4>
          {instances.map((s) => (
            <button
              className="text-link"
              key={`${s.kind}:${s.id}`}
              onClick={() =>
                s.kind === "component"
                  ? onOpenComponent(s.id)
                  : onOpenScreen(s.id)
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <details>
        <summary>Technical component defaults</summary>
        <button className="secondary full" onClick={onTechnical}>
          Edit default JSON
        </button>
      </details>
      <button
        className="danger-text"
        disabled={!!instances.length}
        onClick={() => {
          if (window.confirm(`Delete ${component.name}?`))
            change((d) => {
              d.components = d.components.filter((c) => c.id !== component.id);
            });
        }}
      >
        Delete component
      </button>
      {!!instances.length && (
        <small>
          Remove its instances from the designs above before deleting this
          component.
        </small>
      )}
    </section>
  );
}
