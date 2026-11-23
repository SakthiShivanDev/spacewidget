import React, { useEffect, useId, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { ActionEditor } from "./ActionEditor.jsx";
import { MappingEditor } from "./ValueMapping.jsx";
import { WidgetPicker } from "./WidgetPicker.jsx";
import { widget, uid } from "./model.js";
import {
  designerField,
  activeDesignerField,
  designGroup,
  optionLabel,
  designerPresentation,
  colorSwatch,
  applyColorSwatch,
} from "./designer-model.js";
import { binding, parseProperty } from "./property-values.js";
import { fieldsFor, properties, widgetType } from "./widget-catalog.js";

function Field({ label, children, hint }) {
  const id = useId();
  return (
    <div className="field">
      <label id={id}>{label}</label>
      {React.Children.map(children, (child) =>
        React.isValidElement(child) &&
        ["input", "select", "textarea"].includes(child.type)
          ? React.cloneElement(child, { "aria-labelledby": id })
          : child,
      )}
      {hint && <small>{hint}</small>}
    </div>
  );
}

function serialize(value, kind) {
  if (value === undefined) return "";
  if (kind === "color" && typeof value === "number" && Number.isInteger(value))
    return `#${(value >>> 0).toString(16).padStart(8, "0")}`;
  if (
    ["json", "array", "insets", "action", "widget", "widgets"].includes(kind) ||
    (typeof value === "object" && value !== null)
  )
    return binding(value) ? value : JSON.stringify(value, null, 2);
  return String(value);
}

function ImageSource({ value, onChange }) {
  const [failed, setFailed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setFailed(false);
    setError("");
  }, [value]);
  const url =
    typeof value === "string" &&
    /^(https?:|data:image\/)/i.test(value) &&
    !binding(value)
      ? value
      : null;
  return (
    <div className="image-source-control">
      <label className="field">
        <span>Upload image</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="Upload image"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
              setError("Choose a PNG, JPEG, WebP or GIF image.");
              return;
            }
            if (file.size > 4 * 1024 * 1024) {
              setError("Use an image under 4 MB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result);
            reader.onerror = () => setError("Unable to read image.");
            reader.readAsDataURL(file);
          }}
        />
      </label>
      {url && !failed && (
        <img
          alt="Image source preview"
          className="image-source-preview"
          src={url}
          onError={() => setFailed(true)}
        />
      )}
      {(failed || error) && (
        <p className="property-error" role="alert">
          {error ||
            "This image could not load. Check the direct image URL or upload the file. Flutter web also requires CORS access from the image host."}
        </p>
      )}
      <small>
        For bundled asset paths, select asset as the source in Advanced.
        Uploaded images are included in the published screen.
      </small>
    </div>
  );
}

function ValueEditor({
  field,
  value,
  onChange,
  label = field.label,
  onConnect,
}) {
  const structured =
    value !== null &&
    typeof value === "object" &&
    !["json", "array", "insets", "action", "widget", "widgets"].includes(
      field.kind,
    );
  const actual = structured ? { ...field, kind: "json" } : field;
  const initial = serialize(value, actual.kind);
  const [draft, setDraft] = useState(initial),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(initial);
    setError("");
  }, [initial]);
  const complex = ["json", "array", "action", "widget", "widgets"].includes(
    actual.kind,
  );
  function apply(text, commit = false) {
    setDraft(text);
    try {
      const parsed = parseProperty(text, actual);
      setError("");
      if (!complex || commit) onChange(parsed);
    } catch (e) {
      setError(e.message);
    }
  }
  const bound = binding(value);
  return (
    <div className="property-control" data-property={field.key}>
      <Field label={label} hint={field.hint}>
        {actual.kind === "insets" && !bound ? (
          <InsetEditor label={label} value={value} onChange={onChange} />
        ) : actual.key === "fontWeight" && !bound ? (
          <select
            aria-label={label}
            value={value ?? ""}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">Automatic</option>
            {[
              [100, "Thin"],
              [200, "Extra light"],
              [300, "Light"],
              [400, "Regular"],
              [500, "Medium"],
              [600, "Semibold"],
              [700, "Bold"],
              [800, "Extra bold"],
              [900, "Black"],
            ].map(([weight, name]) => (
              <option key={weight} value={weight}>
                {name} · {weight}
              </option>
            ))}
          </select>
        ) : actual.kind === "boolean" && !bound ? (
          <select
            value={value === undefined ? "" : String(value)}
            onChange={(e) =>
              onChange(
                e.target.value === "" ? undefined : e.target.value === "true",
              )
            }
          >
            <option value="">Automatic</option>
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        ) : actual.kind === "select" && !bound ? (
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">Automatic</option>
            {value !== undefined && !field.options.includes(value) && (
              <option value={value}>{String(value)}</option>
            )}
            {field.options.map((option) => (
              <option key={option} value={option}>
                {optionLabel(option)}
              </option>
            ))}
          </select>
        ) : actual.kind === "action" && field.key === "onRefresh" ? (
          <>
            <select
              aria-label={label}
              value={
                Array.isArray(value) && value.length === 0
                  ? "none"
                  : !value || value.type === "refresh"
                    ? "refresh"
                    : "custom"
              }
              onChange={(e) =>
                onChange(
                  e.target.value === "refresh"
                    ? { type: "refresh" }
                    : e.target.value === "custom"
                      ? [{ type: "refresh" }]
                      : [],
                )
              }
            >
              <option value="none">No refresh action</option>
              <option value="refresh">Reload this screen and its data</option>
              <option value="custom">Custom action</option>
            </select>
            {value &&
              value.type !== "refresh" &&
              !(Array.isArray(value) && !value.length) && (
                <textarea
                  className="property-json"
                  rows={4}
                  value={draft}
                  onChange={(e) => apply(e.target.value)}
                />
              )}
          </>
        ) : complex ? (
          <textarea
            className="property-json"
            rows={Math.min(8, Math.max(3, draft.split("\n").length))}
            value={draft}
            spellCheck={false}
            onChange={(e) => apply(e.target.value)}
          />
        ) : actual.kind === "text" && field.key === "text" ? (
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => apply(e.target.value)}
          />
        ) : (
          <input
            value={draft}
            inputMode={actual.kind === "number" ? "decimal" : undefined}
            placeholder={
              actual.kind === "insets"
                ? '16 or {"horizontal":16,"vertical":8}'
                : "Auto"
            }
            onChange={(e) => apply(e.target.value)}
          />
        )}
      </Field>
      {actual.kind === "color" && (
        <select
          aria-label={`${label} source`}
          value={
            typeof value === "string" && value.startsWith("@theme.")
              ? value
              : value === undefined
                ? ""
                : "custom"
          }
          onChange={(e) =>
            onChange(
              e.target.value === "custom"
                ? "#7763e8"
                : e.target.value || undefined,
            )
          }
        >
          <option value="">Inherit from app theme</option>
          <option value="custom">Custom color</option>
          {[
            "primary",
            "onPrimary",
            "secondary",
            "onSecondary",
            "surface",
            "onSurface",
            "error",
            "onError",
            "background",
          ].map((key) => (
            <option key={key} value={`@theme.${key}`}>
              Theme · {key.replace(/([A-Z])/g, " $1")}
            </option>
          ))}
        </select>
      )}
      {actual.kind === "color" &&
        !(typeof value === "string" && value.startsWith("@theme.")) && (
          <input
            aria-label={`${label} picker`}
            type="color"
            value={colorSwatch(value)}
            onChange={(e) => onChange(applyColorSwatch(value, e.target.value))}
          />
        )}
      <div className="property-tools">
        {complex && draft !== initial && (
          <button
            type="button"
            className="secondary"
            disabled={!!error}
            onClick={() => apply(draft, true)}
          >
            Apply {field.label.toLowerCase()}
          </button>
        )}
        {value !== undefined && (
          <button
            type="button"
            className="text-link"
            aria-label={`Reset ${label}`}
            onClick={() => {
              setDraft("");
              setError("");
              onChange(undefined);
            }}
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
        {onConnect &&
          [
            "text",
            "title",
            "subtitle",
            "src",
            "items",
            "initialValue",
            "value",
          ].includes(field.key) && (
            <button
              type="button"
              className="text-link"
              aria-label={`Connect ${label} to data`}
              onClick={() => onConnect(field.key)}
            >
              Connect data
            </button>
          )}
      </div>
      {field.key === "src" && <ImageSource value={value} onChange={onChange} />}
      {error && (
        <p className="property-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function CollectionEditor({
  field,
  value,
  onChange,
  screens,
  components,
  editingId,
  onSelect,
  requests,
  parameters,
  forms,
  sharedNavigation,
}) {
  const [advanced, setAdvanced] = useState(false);
  if ((!Array.isArray(value) && value !== undefined) || advanced)
    return (
      <div className="collection-editor">
        <ValueEditor
          field={{ ...field, kind: "array" }}
          value={value}
          onChange={onChange}
        />
        <button
          className="text-link"
          type="button"
          onClick={() => setAdvanced(false)}
        >
          Item controls
        </button>
      </div>
    );
  const list = value || [];
  function update(index, changes) {
    onChange(
      list.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    );
  }
  return (
    <div className="collection-editor" data-collection={field.key}>
      <div className="collection-heading">
        <h4>{field.label}</h4>
        <button
          type="button"
          className="text-link"
          onClick={() => setAdvanced(true)}
        >
          JSON / binding
        </button>
      </div>
      {list.map((item, index) => (
        <div className="collection-item" key={index}>
          <div className="collection-heading">
            <strong>
              {field.key === "destinations" ? "Item" : "Entry"} {index + 1}
            </strong>
            <div className="collection-actions">
              <button
                type="button"
                aria-label={`Move ${field.key} item ${index + 1} up`}
                disabled={index === 0}
                onClick={() => {
                  const next = [...list];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  onChange(next);
                }}
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                aria-label={`Remove ${field.key} item ${index + 1}`}
                disabled={
                  list.length <=
                  (sharedNavigation && field.key === "destinations"
                    ? 2
                    : field.min || 0)
                }
                onClick={() => onChange(list.filter((_, i) => i !== index))}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          {field.fields &&
          item &&
          typeof item === "object" &&
          !Array.isArray(item) ? (
            field.fields.map((key) => {
              const itemLabel = `${field.key === "destinations" ? "Item" : "Entry"} ${index + 1} ${key.replace(/([A-Z])/g, " $1").toLowerCase()}`;
              if (key === "content")
                return (
                  <div key={key} className="collection-widget-slot">
                    <Field label={itemLabel}>
                      <WidgetPicker
                        label={`${itemLabel} widget type`}
                        value={
                          item.content?.type === "component"
                            ? `component:${item.content.componentId}`
                            : widgetType(item.content)
                        }
                        components={components}
                        editingId={editingId}
                        onChange={(type) =>
                          update(index, {
                            content: type.startsWith("component:")
                              ? {
                                  type: "component",
                                  id: uid(),
                                  componentId: type.slice(10),
                                  values: {},
                                }
                              : widget(type),
                          })
                        }
                      />
                    </Field>
                    {item.content?.id && (
                      <button
                        type="button"
                        className="secondary full"
                        onClick={() => onSelect(item.content.id)}
                      >
                        Edit content widget
                      </button>
                    )}
                  </div>
                );
              if (key === "action" && field.key === "destinations")
                return (
                  <div key={key}>
                    <label className="field">
                      <span>{`Item ${index + 1} screen`}</span>
                      <select
                        aria-label={`Item ${index + 1} screen`}
                        value={
                          item.screenId ||
                          item.action?.source?.split("/").at(-1) ||
                          ""
                        }
                        onChange={(e) =>
                          update(index, {
                            screenId: e.target.value || undefined,
                            query: undefined,
                            action: e.target.value
                              ? {
                                  type: "replace",
                                  source: `/runtime/screens/${e.target.value}`,
                                }
                              : undefined,
                          })
                        }
                      >
                        {!sharedNavigation && (
                          <option value="">Choose destination screen</option>
                        )}
                        {screens.map((s) => (
                          <option
                            key={s.id}
                            value={s.id}
                            disabled={
                              sharedNavigation &&
                              list.some(
                                (item, j) =>
                                  j !== index && item.screenId === s.id,
                              )
                            }
                          >
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <MappingEditor
                      label={`Item ${index + 1} parameters`}
                      value={sharedNavigation ? item.query : item.action?.query}
                      definitions={
                        screens.find(
                          (s) =>
                            s.id ===
                            (item.screenId ||
                              item.action?.source?.split("/").at(-1)),
                        )?.parameters || {}
                      }
                      parameters={parameters}
                      onChange={(query) =>
                        sharedNavigation
                          ? update(index, { query })
                          : update(index, { action: { ...item.action, query } })
                      }
                    />
                    {!sharedNavigation && (
                      <details>
                        <summary>Other item interaction</summary>
                        <ActionEditor
                          key={key}
                          label={`${itemLabel} destination`}
                          value={item.action}
                          onChange={(action) => update(index, { action })}
                          {...{
                            screens,
                            components,
                            editingId,
                            onSelect,
                            requests,
                            parameters,
                            forms,
                          }}
                        />
                      </details>
                    )}
                  </div>
                );
              return (
                <React.Fragment key={key}>
                  {key === "value" && (
                    <Field label={`${itemLabel} type`}>
                      <select
                        value={
                          typeof item.value === "object"
                            ? "json"
                            : typeof item.value
                        }
                        onChange={(e) =>
                          update(index, {
                            value:
                              e.target.value === "number"
                                ? 0
                                : e.target.value === "boolean"
                                  ? false
                                  : e.target.value === "json"
                                    ? {}
                                    : "",
                          })
                        }
                      >
                        <option value="string">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="json">JSON</option>
                      </select>
                    </Field>
                  )}
                  <ValueEditor
                    field={{
                      key,
                      label: key,
                      kind:
                        key === "content"
                          ? "widget"
                          : key === "value"
                            ? typeof item.value === "string"
                              ? "text"
                              : typeof item.value === "number"
                                ? "number"
                                : typeof item.value === "boolean"
                                  ? "boolean"
                                  : "json"
                            : ["latitude", "longitude"].includes(key)
                              ? "number"
                              : key === "complete"
                                ? "boolean"
                                : "text",
                    }}
                    label={itemLabel}
                    value={item[key]}
                    onChange={(value) => update(index, { [key]: value })}
                  />
                </React.Fragment>
              );
            })
          ) : (
            <ValueEditor
              field={{ key: "item", label: "Item JSON", kind: "json" }}
              label={`Entry ${index + 1} JSON`}
              value={item}
              onChange={(value) =>
                onChange(list.map((entry, i) => (i === index ? value : entry)))
              }
            />
          )}
        </div>
      ))}
      <button
        type="button"
        className="secondary full"
        disabled={
          sharedNavigation &&
          field.key === "destinations" &&
          (list.length >= 5 ||
            !screens.some((s) => !list.some((item) => item.screenId === s.id)))
        }
        onClick={() => {
          const item = structuredClone(field.item || {});
          if (sharedNavigation && field.key === "destinations") {
            const destination = screens.find(
              (s) => !list.some((item) => item.screenId === s.id),
            );
            if (!destination) return;
            item.screenId = destination.id;
            item.label = destination.name;
          }
          if (field.key === "options")
            item.value = `option_${crypto.randomUUID().slice(0, 8)}`;
          if (field.key === "columns")
            item.key = `column_${crypto.randomUUID().slice(0, 8)}`;
          if (field.key === "rows") item.id = crypto.randomUUID();
          onChange([...list, item]);
        }}
      >
        <Plus size={14} />
        {field.key === "destinations"
          ? "Add navigation item"
          : field.key === "options"
            ? "Add option"
            : field.key === "steps"
              ? "Add step"
              : field.key === "columns"
                ? "Add column"
                : field.key === "rows"
                  ? "Add row"
                  : "Add item"}
      </button>
    </div>
  );
}

function ChildEditor({
  field,
  node,
  onPatch,
  onSelect,
  onAdd,
  components,
  editingId,
}) {
  const p = properties(node),
    form = p.type === "form" && field.key === "children";
  const [type, setType] = useState(
      form
        ? "input"
        : field.key === "appBar"
          ? "appBar"
          : field.key === "headers"
            ? "sliverToBoxAdapter"
            : p.type === "tabBar"
              ? "tab"
              : "text",
    ),
    [json, setJson] = useState(false);
  const value = p[field.key],
    many = field.kind === "widgets";
  const list = many
    ? Array.isArray(value)
      ? value
      : []
    : value && typeof value === "object"
      ? [value]
      : [];
  if (form && p.child)
    return (
      <div className="child-editor">
        <p className="muted">
          This form uses a child layout. Add fields inside it.
        </p>
        <button className="secondary full" onClick={() => onSelect(p.child.id)}>
          Edit form layout
        </button>
        <ChildAdder
          {...{ type, setType, onAdd, components, editingId }}
          parentType={p.type}
          field={field}
          form={form}
        />
      </div>
    );
  return (
    <div className="child-editor" data-slot={field.key}>
      <div className="collection-heading">
        <h4>{form ? "Form fields" : field.label}</h4>
        <button
          type="button"
          className="text-link"
          onClick={() => setJson(!json)}
        >
          JSON
        </button>
      </div>
      {json && (
        <ValueEditor
          field={field}
          value={value}
          onChange={(value) => onPatch({ [field.key]: value })}
        />
      )}
      {list.map((child, index) => (
        <div className="child-row" key={child.id || index}>
          <button
            type="button"
            className="child-select"
            onClick={() => onSelect(child.id)}
            disabled={!child.id}
          >
            {child.labelName ||
              properties(child).label ||
              properties(child).text ||
              widgetType(child) ||
              `Widget ${index + 1}`}
          </button>
          <span>{widgetType(child)}</span>
          {many && (
            <button
              type="button"
              aria-label={`Move ${field.key} widget ${index + 1} up`}
              disabled={index === 0}
              onClick={() => {
                const next = [...list];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onPatch({ [field.key]: next });
              }}
            >
              <ArrowUp size={13} />
            </button>
          )}
          {many && (
            <button
              type="button"
              aria-label={`Move ${field.key} widget ${index + 1} down`}
              disabled={index === list.length - 1}
              onClick={() => {
                const next = [...list];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onPatch({ [field.key]: next });
              }}
            >
              <ArrowDown size={13} />
            </button>
          )}
          <button
            type="button"
            aria-label={`Remove ${field.key} widget ${index + 1}`}
            onClick={() =>
              onPatch({
                [field.key]: many
                  ? list.filter((_, i) => i !== index)
                  : undefined,
              })
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <ChildAdder
        {...{ type, setType, onAdd, components, editingId }}
        parentType={p.type}
        field={field}
        form={form}
        replace={!many && list.length > 0}
      />
    </div>
  );
}
function ChildAdder({
  type,
  setType,
  onAdd,
  field,
  form,
  replace,
  components,
  editingId,
  parentType,
}) {
  return (
    <div className="child-adder">
      <Field label={form ? "Field type" : `${field.label} widget type`}>
        <WidgetPicker
          value={type}
          onChange={setType}
          label={form ? "Field type" : `${field.label} widget type`}
          {...{ form, components, editingId, parentType }}
          slot={field.key}
        />
      </Field>
      <button
        type="button"
        className="secondary full"
        onClick={() => onAdd(type, field.key)}
      >
        <Plus size={14} />
        {form
          ? "Add field"
          : replace
            ? `Replace ${field.label.toLowerCase()}`
            : `Add ${field.label.toLowerCase()} widget`}
      </button>
      <small className="slot-hint">
        {field.key === "headers"
          ? "Sliver widgets for this scroll header."
          : parentType === "tabBar"
            ? "Tabs stay synchronized with their pages."
            : "Search widgets and reusable components. Layout wrappers are added when required."}
      </small>
    </div>
  );
}

function InsetEditor({ label, value, onChange }) {
  const [separate, setSeparate] = useState(typeof value === "object");
  const sides =
    typeof value === "number"
      ? { top: value, right: value, bottom: value, left: value }
      : {
          top: value?.top ?? value?.vertical ?? 0,
          right: value?.right ?? value?.horizontal ?? 0,
          bottom: value?.bottom ?? value?.vertical ?? 0,
          left: value?.left ?? value?.horizontal ?? 0,
        };
  const input = (side) => (
    <input
      aria-label={`${label} ${side || "all sides"}`}
      type="number"
      min="0"
      step="1"
      value={separate ? sides[side] : typeof value === "number" ? value : ""}
      placeholder="0"
      onChange={(e) => {
        const next = e.target.value === "" ? undefined : Number(e.target.value);
        if (next !== undefined && (!Number.isFinite(next) || next < 0)) return;
        if (!separate) onChange(next);
        else {
          const result = { ...sides };
          if (next === undefined) delete result[side];
          else result[side] = next;
          onChange(result);
        }
      }}
    />
  );
  return (
    <div className="inset-editor">
      <div className="inset-heading">
        <span>{separate ? "Individual sides" : "All sides"}</span>
        <button
          type="button"
          className="text-link"
          aria-label={`${label} ${separate ? "link sides" : "edit sides"}`}
          onClick={() => setSeparate(!separate)}
        >
          {separate ? "Link sides" : "Edit sides"}
        </button>
      </div>
      {separate ? (
        <div className="inset-sides">
          {["top", "right", "bottom", "left"].map((side) => (
            <label key={side}>
              <small>{optionLabel(side)}</small>
              {input(side)}
            </label>
          ))}
        </div>
      ) : (
        input()
      )}
    </div>
  );
}
export function WidgetProperties({
  node,
  onPatch,
  onSelect,
  onAdd,
  screens,
  components = [],
  editingId,
  view = "design",
  onConnect,
  requests = [],
  parameters = {},
  forms = [],
  sharedNavigation = false,
}) {
  const p = properties(node),
    all = fieldsFor(node).filter(
      (f) => !(p.type === "component" && f.key === "values"),
    );
  const [showMore, setShowMore] = useState(false);
  const fields = all
    .map((f) => (view === "design" ? designerPresentation(f) : f))
    .filter((f) =>
      view === "actions"
        ? f.kind === "action"
        : view === "advanced"
          ? true
          : f.kind !== "action" &&
            activeDesignerField(f, node) &&
            (showMore || designerField(f, p.type)),
    );
  const groups =
    view === "design"
      ? [
          "Content",
          "Layout",
          "Typography",
          "Fill & effects",
          "Stroke & corners",
          "Appearance",
          "Contents",
        ]
      : ["Properties", "Layout", "Appearance", "Child widgets", "Events"];
  const sections = groups.map((group) => {
    const entries = fields.filter(
      (f) => (view === "design" ? designGroup(f) : f.group) === group,
    );
    if (view === "design" && group === "Typography") {
      const order = [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "textAlign",
        "decoration",
        "italic",
        "maxLines",
      ];
      entries.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    }
    return entries.length ? (
      <details
        key={group}
        className={`inspector-section widget-properties ${view === "design" ? "designer-properties" : ""}`}
        open
      >
        <summary>{group}</summary>
        <div className="property-grid">
          {entries.map((field) =>
            field.kind === "action" ? (
              <ActionEditor
                key={field.key}
                label={field.label}
                value={
                  field.key === "onRefresh" && p[field.key] === undefined
                    ? { type: "refresh" }
                    : p[field.key]
                }
                onChange={(value) =>
                  onPatch({
                    [field.key]:
                      field.key === "onRefresh" && value === undefined
                        ? []
                        : value,
                  })
                }
                {...{
                  screens,
                  components,
                  editingId,
                  onSelect,
                  requests,
                  parameters,
                  forms,
                }}
              />
            ) : field.kind === "collection" ? (
              <CollectionEditor
                key={field.key}
                field={field}
                value={p[field.key]}
                onChange={(value) => onPatch({ [field.key]: value })}
                {...{
                  screens,
                  components,
                  editingId,
                  onSelect,
                  requests,
                  parameters,
                  forms,
                  sharedNavigation,
                }}
              />
            ) : ["widget", "widgets"].includes(field.kind) ? (
              <ChildEditor
                key={field.key}
                field={field}
                {...{ node, onPatch, onSelect, onAdd, components, editingId }}
              />
            ) : (
              <ValueEditor
                key={field.key}
                field={field}
                value={p[field.key]}
                onChange={(value) => onPatch({ [field.key]: value })}
                onConnect={view === "design" ? onConnect : undefined}
              />
            ),
          )}
        </div>
      </details>
    ) : null;
  });
  return (
    <>
      {sections}
      {view === "design" &&
        all.some((f) => !designerField(f, p.type) && f.kind !== "action") && (
          <div className="inspector-section more-properties">
            <button
              className="text-link"
              onClick={() => setShowMore(!showMore)}
            >
              {showMore
                ? "Show essential properties"
                : "Show all design properties"}
            </button>
            <p className="help-copy">
              Developer options are also available in Advanced.
            </p>
          </div>
        )}
      {view === "actions" && !fields.length && (
        <div className="inspector-section">
          <p className="help-copy">
            This layer has no interactive events. Select a button or an
            interactive container to add an action.
          </p>
        </div>
      )}
    </>
  );
}

export function ComponentValues({
  defaults = {},
  values = {},
  onChange,
  designer = false,
  editable = false,
}) {
  const [propertyName, setPropertyName] = useState("");
  const [propertyType, setPropertyType] = useState("text");
  return (
    <div className="component-values">
      {Object.entries(defaults)
        .filter(
          ([key, value]) =>
            !designer ||
            (!Array.isArray(value) &&
              (typeof value !== "object" || value === null) &&
              !["items", "onProductTap"].includes(key) &&
              !key.endsWith("Field")),
        )
        .map(([key, fallback]) => {
          const value = Object.hasOwn(values, key) ? values[key] : fallback;
          const kind =
            typeof fallback === "boolean"
              ? "boolean"
              : typeof fallback === "number"
                ? "number"
                : typeof fallback === "string"
                  ? "text"
                  : "json";
          return (
            <ValueEditor
              key={key}
              field={{
                key,
                label: key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (s) => s.toUpperCase()),
                kind,
              }}
              value={value}
              onChange={(next) => {
                const result = { ...values };
                if (next === undefined) delete result[key];
                else result[key] = next;
                onChange(result);
              }}
            />
          );
        })}
      {!Object.keys(defaults).length && (
        <p className="muted">
          Add default properties to the component to expose controls here.
        </p>
      )}
      {editable && (
        <div className="parameter-card">
          <h4>Add a component property</h4>
          <label className="field">
            <span>Property name</span>
            <input
              aria-label="New component property"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              placeholder="title"
            />
          </label>
          <label className="field">
            <span>Property type</span>
            <select
              aria-label="New component property type"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">True / false</option>
            </select>
          </label>
          <button
            type="button"
            className="secondary full"
            disabled={
              !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(propertyName) ||
              ["__proto__", "constructor", "prototype"].includes(
                propertyName,
              ) ||
              Object.hasOwn(defaults, propertyName)
            }
            onClick={() => {
              onChange({
                ...values,
                [propertyName]:
                  propertyType === "number"
                    ? 0
                    : propertyType === "boolean"
                      ? false
                      : "",
              });
              setPropertyName("");
            }}
          >
            Add property
          </button>
          <small>
            Select a layer → Content → Component property to display this value.
            Each instance can supply a different value.
          </small>
        </div>
      )}
    </div>
  );
}
