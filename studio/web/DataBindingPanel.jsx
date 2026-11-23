import React, { useState, useEffect } from "react";
import {
  Database,
  Link2,
  LayoutGrid,
  Rows3,
  ArrowRight,
  Unlink,
} from "lucide-react";
import { fieldsFor, properties, defaultBinding } from "./widget-catalog.js";
import {
  bindingContext,
  activeDesignerField,
  bindingChoices,
  bindingPatch,
  friendlyName,
  previewValue,
  queryFromBinding,
} from "./designer-model.js";

export function DataBindingPanel({
  node,
  doc,
  screen,
  tree,
  componentId,
  sample,
  target,
  onTarget,
  onPatch,
  onSelect,
  onManage,
  onLoad,
  busy,
  users = [],
  previewUser,
  onPreviewUser,
  onRefreshUsers,
}) {
  const context = bindingContext(doc, screen, tree, node, componentId, sample),
    p = properties(node);
  const component = doc.components.find((c) => c.id === componentId);
  const fields = fieldsFor(node).filter(
    (f) =>
      activeDesignerField(f, node) &&
      (!["widget", "widgets", "action", "insets", "collection"].includes(
        f.kind,
      ) ||
        f.key === "items"),
  );
  const active = fields.some((f) => f.key === target)
    ? target
    : fields.some((f) => f.key === defaultBinding(node))
      ? defaultBinding(node)
      : fields[0]?.key || "text";
  const choices = bindingChoices(context, active, component);
  const [search, setSearch] = useState("");
  const current = p[active];
  const lists = context.queries.filter((q) => !q.single);
  const repeat = p.type === "repeat",
    collection =
      p.type === "component" &&
      doc.components.find((c) => c.id === node.componentId)?.defaults?.items !==
        undefined;
  const collectionSource = repeat ? p.items : p.values?.items;
  const inherited = collectionSource === "{{props.items}}";
  const selectedQuery =
    queryFromBinding(collectionSource, context.queries) ||
    (inherited ? context.query : undefined);
  return (
    <div className="designer-data-panel">
      <div className="inspector-section data-guide">
        <Database size={20} />
        <h3>{repeat || collection ? "Repeat records" : "Connect content"}</h3>
        <p>
          {repeat || collection
            ? "Choose a collection. Design one item and the app repeats it for every record."
            : "Choose which record field appears in this layer. You do not need to write a binding expression."}
        </p>
      </div>
      {(repeat || collection) && (
        <div className="inspector-section collection-connection">
          <label className="field">
            <span>Collection</span>
            <select
              aria-label="Repeated collection"
              value={inherited ? "__component_items" : selectedQuery?.id || ""}
              onChange={(e) => {
                if (!e.target.value) return;
                const value =
                  e.target.value === "__component_items"
                    ? "{{props.items}}"
                    : `{{${e.target.value}}}`;
                onPatch(
                  repeat
                    ? { items: value }
                    : { values: { ...p.values, items: value } },
                );
              }}
            >
              <option value="">Choose a connected collection…</option>
              {component && Array.isArray(component.defaults?.items) && (
                <option value="__component_items">
                  Component property · Items
                </option>
              )}
              {lists.map((q) => (
                <option key={q.id} value={q.id}>
                  {friendlyName(q.id)} · {q.table}
                </option>
              ))}
            </select>
          </label>
          {selectedQuery && (
            <>
              <div className="source-summary">
                <Database size={14} />
                <span>
                  {selectedQuery.table || selectedQuery.id}
                  <small>
                    {selectedQuery.select.length} fields ·{" "}
                    {selectedQuery.single ? "One record" : "Multiple records"}
                  </small>
                </span>
                <button
                  className="text-link"
                  disabled={busy || selectedQuery?.virtual}
                  onClick={() => onLoad(selectedQuery, previewUser)}
                >
                  Load records
                </button>
              </div>
              <p className="help-copy">
                {Array.isArray(sample?.[selectedQuery.id])
                  ? `${sample[selectedQuery.id].length} sample records available.`
                  : selectedQuery.virtual
                    ? "Sampled from screen data. Switch the canvas to Live content to update API content."
                    : "Load records to see real content in the canvas."}
              </p>
            </>
          )}
          {repeat && (
            <>
              <div className="segmented-options" aria-label="Collection layout">
                {[
                  ["list", "List", Rows3],
                  ["grid", "Grid", LayoutGrid],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={(p.layout || "list") === value}
                    className={(p.layout || "list") === value ? "active" : ""}
                    onClick={() => onPatch({ layout: value })}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
              {p.layout === "grid" && (
                <div className="compact-field-grid">
                  <label className="field">
                    <span>Columns</span>
                    <input
                      aria-label="Grid columns"
                      type="number"
                      min="1"
                      max="12"
                      value={p.crossAxisCount || 2}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 12)
                          onPatch({ crossAxisCount: n });
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Gap</span>
                    <input
                      aria-label="Grid gap"
                      type="number"
                      min="0"
                      value={p.crossAxisSpacing ?? 12}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 0)
                          onPatch({ crossAxisSpacing: n, mainAxisSpacing: n });
                      }}
                    />
                  </label>
                </div>
              )}
              {p.template?.id && (
                <button
                  className="secondary full"
                  onClick={() => onSelect(p.template.id)}
                >
                  Edit item design <ArrowRight size={14} />
                </button>
              )}
              <p className="help-copy">
                Inside the item design, use Content → Current item to connect
                each text or image field.
              </p>
            </>
          )}
          {collection && selectedQuery && (
            <div className="component-field-mapping">
              <h4>Map card content</h4>
              <p className="help-copy">
                Choose which record field each part of the card displays.
              </p>
              {Object.entries(
                doc.components.find((c) => c.id === node.componentId)
                  ?.defaults || {},
              )
                .filter(([key]) => key.endsWith("Field"))
                .map(([key, fallback]) => {
                  const value = p.values?.[key] ?? fallback;
                  return (
                    <label className="field" key={key}>
                      <span>{friendlyName(key.replace(/Field$/, ""))}</span>
                      <select
                        aria-label={`${friendlyName(key.replace(/Field$/, ""))} record field`}
                        value={value}
                        onChange={(e) =>
                          onPatch({
                            values: { ...p.values, [key]: e.target.value },
                          })
                        }
                      >
                        <option value="">No field</option>
                        {value && !selectedQuery.select.includes(value) && (
                          <option value={value}>Not available · {value}</option>
                        )}
                        {selectedQuery.select.map((field) => (
                          <option key={field} value={field}>
                            {friendlyName(field)}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
            </div>
          )}
          {collection && (
            <button
              className="secondary full"
              onClick={() => onManage("component", node.componentId)}
            >
              Edit reusable item design <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {context.queries.some((q) => q.scope === "user") && (
        <div className="inspector-section">
          <label className="field">
            <span>Preview as app user</span>
            <select
              aria-label="Preview app user"
              value={previewUser || ""}
              onChange={(e) => onPreviewUser(e.target.value)}
            >
              <option value="">Choose a test user…</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>
            <small>
              Private records are loaded only for the app user you choose.
            </small>
          </label>
          <button className="text-link" onClick={onRefreshUsers}>
            Refresh users
          </button>
        </div>
      )}
      <div className="inspector-section">
        <h3>Connect a property</h3>
        <label className="field">
          <span>Show data in</span>
          <select
            aria-label="Target property"
            value={active}
            onChange={(e) => onTarget(e.target.value)}
          >
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {context.item && (
          <div className="context-note">
            <Link2 size={14} />
            <span>
              Current item<small>Each copy displays its own record.</small>
            </span>
          </div>
        )}
        {typeof current === "string" && /\{\{/.test(current) && (
          <div className="connected-value">
            <span>
              <Link2 size={13} />
              {current.replace(/[{}]/g, "")}
            </span>
            <button
              aria-label="Disconnect data binding"
              title="Disconnect data binding"
              onClick={() => onPatch(bindingPatch(node, active, undefined))}
            >
              <Unlink size={14} />
            </button>
          </div>
        )}
        <input
          type="search"
          className="data-field-search"
          aria-label="Search data fields"
          placeholder="Search fields…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="data-field-list">
          {choices
            .filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
            .map((choice) => (
              <button
                key={choice.value}
                className={`data-field-option ${current === choice.value ? "selected" : ""}`}
                onClick={() =>
                  onPatch(bindingPatch(node, active, choice.value))
                }
              >
                <span>
                  <strong>{choice.label}</strong>
                  <small>
                    {previewValue(choice.path, sample, context, component)}
                  </small>
                </span>
                <Link2 size={14} />
              </button>
            ))}
        </div>
        {!choices.length && (
          <div className="data-empty">
            <p>
              {context.queries.some((q) => !q.single) &&
              !context.item &&
              !["items", "rows", "values", "initialItems", "images"].includes(
                active,
              )
                ? "A collection contains many records. Add a repeated list or grid, then connect fields inside its item design."
                : "Connect a data source or add component properties to see available fields."}
            </p>
          </div>
        )}
      </div>
      <div className="inspector-section">
        <button className="secondary full" onClick={() => onManage("data")}>
          Manage data sources <ArrowRight size={14} />
        </button>
        <p className="help-copy">
          Data sources choose records. Property connections decide where those
          records appear.
        </p>
      </div>
    </div>
  );
}

export function CollectionBuilder({ query, onSubmit }) {
  const [layout, setLayout] = useState("grid"),
    [titleField, setTitle] = useState(
      query.select.find((k) => ["name", "title"].includes(k)) ||
        query.select[0],
    );
  const [subtitleField, setSubtitle] = useState(
    query.select.find((k) =>
      ["category", "description", "subtitle"].includes(k),
    ) || "",
  );
  return (
    <div className="collection-builder">
      <div className="wizard-intro">
        <span className="step-kicker">COLLECTION DESIGN</span>
        <h3>Turn {friendlyName(query.id).toLowerCase()} into a list or grid</h3>
        <p>
          Choose what appears in one item. The app repeats it for every record
          from <strong>{query.table}</strong>.
        </p>
      </div>
      <div className="collection-layout-cards">
        {[
          [
            "list",
            "List",
            Rows3,
            "Rows for directories, messages and settings.",
          ],
          [
            "grid",
            "Grid",
            LayoutGrid,
            "Cards for products, courses and galleries.",
          ],
        ].map(([value, label, Icon, copy]) => (
          <button
            key={value}
            className={layout === value ? "selected" : ""}
            aria-pressed={layout === value}
            onClick={() => setLayout(value)}
          >
            <Icon size={28} />
            <strong>{label}</strong>
            <small>{copy}</small>
          </button>
        ))}
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Item title</span>
          <select
            aria-label="Item title field"
            value={titleField}
            onChange={(e) => setTitle(e.target.value)}
          >
            {query.select.map((f) => (
              <option key={f} value={f}>
                {friendlyName(f)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Supporting text</span>
          <select
            aria-label="Item subtitle field"
            value={subtitleField}
            onChange={(e) => setSubtitle(e.target.value)}
          >
            <option value="">No supporting text</option>
            {query.select.map((f) => (
              <option key={f} value={f}>
                {friendlyName(f)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={`collection-example ${layout}`}>
        <div>
          <strong>{friendlyName(titleField)}</strong>
          {subtitleField && <small>{friendlyName(subtitleField)}</small>}
        </div>
        <div>
          <strong>{friendlyName(titleField)}</strong>
          {subtitleField && <small>{friendlyName(subtitleField)}</small>}
        </div>
      </div>
      <p className="help-copy">
        This illustration shows the structure. The Flutter canvas uses your
        sample or database records.
      </p>
      <div className="modal-actions">
        <button
          className="primary"
          onClick={() => onSubmit({ layout, titleField, subtitleField })}
        >
          Add {layout === "grid" ? "grid" : "list"} to screen
        </button>
      </div>
    </div>
  );
}
