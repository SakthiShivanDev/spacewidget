import React, { useEffect, useState } from "react";
import {
  Database,
  Check,
  ChevronRight,
  Plus,
  Trash2,
  Rows3,
  UserRound,
} from "lucide-react";
import { friendlyName } from "./designer-model.js";
const operators = {
  eq: "is equal to",
  ne: "is not equal to",
  contains: "contains",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  in: "is one of",
};
export function QueryBuilder({
  parameters = {},
  reservedNames = [],
  initial,
  api,
  app,
  connections,
  onSubmit,
}) {
  const first = initial || {};
  const [step, setStep] = useState(1),
    [connection, setConnection] = useState(
      first.connectionId || connections[0]?.id || "",
    ),
    [tables, setTables] = useState([]),
    [table, setTable] = useState(first.table || ""),
    [columns, setColumns] = useState([]),
    [selected, setSelected] = useState(first.select || []),
    [name, setName] = useState(first.id || ""),
    [single, setSingle] = useState(first.single || false),
    [scope, setScope] = useState(first.scope || "public"),
    [owner, setOwner] = useState(first.ownerColumn || "user_id"),
    [filters, setFilters] = useState(first.filters || []),
    [order, setOrder] = useState(first.orderBy || "id"),
    [direction, setDirection] = useState(first.direction || "asc"),
    [limit, setLimit] = useState(first.limit || 20),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    setTables([]);
    if (!connection) return;
    setLoading(true);
    api(`/api/apps/${app.id}/connections/${connection}/tables`)
      .then((list) => {
        if (!active) return;
        setTables(list);
        setTable((current) =>
          list.includes(current) ? current : list[0] || "",
        );
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [connection]);
  useEffect(() => {
    let active = true;
    setColumns([]);
    if (!table || !tables.includes(table)) return;
    setLoading(true);
    api(`/api/apps/${app.id}/connections/${connection}/tables/${table}`)
      .then((list) => {
        if (!active) return;
        setColumns(list);
        setSelected((current) =>
          current.filter((k) => list.some((c) => c.name === k)),
        );
        setOrder((current) =>
          list.some((c) => c.name === current)
            ? current
            : list[0]?.name || "id",
        );
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [connection, table, tables]);
  function next() {
    setError("");
    if (step === 1 && (!table || loading))
      return setError("Choose a database and table first.");
    if (step === 2 && !selected.length)
      return setError("Choose at least one field to display.");
    setStep(step + 1);
  }
  function submit(e) {
    e.preventDefault();
    if (step < 3) {
      next();
      return;
    }
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(name))
      return setError(
        "Use a short name starting with a letter, with letters, numbers or underscores.",
      );
    if (name !== first.id && reservedNames.includes(name))
      return setError(
        "This screen already uses that content name. Choose another name.",
      );
    if (!Number.isInteger(Number(limit)) || limit < 1 || limit > 100)
      return setError("Choose 1 to 100 records per page.");
    if (!selected.length) return setError("Choose at least one field.");
    if (scope === "user" && !columns.some((c) => c.name === owner))
      return setError("Choose the field that identifies the record’s owner.");
    onSubmit({
      id: name,
      connectionId: connection,
      table,
      select: selected,
      scope,
      ownerColumn: owner,
      filters,
      orderBy: order,
      direction,
      limit: Number(limit),
      single,
    });
  }
  function updateFilter(index, changes) {
    setFilters(filters.map((f, i) => (i === index ? { ...f, ...changes } : f)));
  }
  return (
    <form className="query-wizard" onSubmit={submit}>
      <ol className="wizard-steps" aria-label="Connect data steps">
        {["Choose records", "Choose fields", "Review & filter"].map(
          (label, index) => (
            <li
              key={label}
              className={
                step === index + 1
                  ? "active"
                  : step > index + 1
                    ? "complete"
                    : ""
              }
            >
              <span>{step > index + 1 ? <Check size={13} /> : index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      {step === 1 && (
        <>
          <div className="wizard-intro">
            <h3>Where should this screen get its content?</h3>
            <p>
              Choose a table, then decide whether this screen needs one record
              or a collection.
            </p>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Database connection</span>
              <select
                aria-label="Database connection"
                value={connection}
                onChange={(e) => {
                  setConnection(e.target.value);
                  setTable("");
                  setSelected([]);
                  setFilters([]);
                }}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Table</span>
              <select
                aria-label="Table"
                disabled={loading && !tables.length}
                value={table}
                onChange={(e) => {
                  setTable(e.target.value);
                  setSelected([]);
                  setFilters([]);
                  if (!initial) setName(e.target.value.toLowerCase());
                }}
              >
                {!tables.length && (
                  <option value="">
                    {loading ? "Loading tables…" : "Choose a table"}
                  </option>
                )}
                {tables.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="record-mode-cards">
            {[
              [
                false,
                "Collection",
                Rows3,
                "Products, courses, posts or other repeated content.",
              ],
              [
                true,
                "One record",
                UserRound,
                "A profile, account summary or detail screen.",
              ],
            ].map(([value, label, Icon, copy]) => (
              <button
                key={label}
                type="button"
                aria-pressed={single === value}
                className={single === value ? "selected" : ""}
                onClick={() => setSingle(value)}
              >
                <Icon size={24} />
                <strong>{label}</strong>
                <small>{copy}</small>
              </button>
            ))}
          </div>
          {!connections.length && (
            <p className="error">Connect a database from Content first.</p>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <div className="wizard-intro">
            <h3>Which fields will your design use?</h3>
            <p>
              Choose only the content this screen needs. You can connect these
              fields to text, images and repeated items.
            </p>
          </div>
          <input
            type="search"
            aria-label="Search table fields"
            placeholder="Search fields…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="column-picker wizard-column-picker">
            {columns
              .filter((c) =>
                c.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((c) => (
                <label key={c.name}>
                  <input
                    type="checkbox"
                    aria-label={c.name}
                    checked={selected.includes(c.name)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, c.name]
                          : selected.filter((k) => k !== c.name),
                      )
                    }
                  />
                  <span>
                    <strong>{friendlyName(c.name)}</strong>
                    <small>{c.name}</small>
                  </span>
                  <span className="field-type-badge">
                    {/int|real|decimal|numeric/i.test(c.type)
                      ? "Number"
                      : /bool/i.test(c.type)
                        ? "Yes / No"
                        : "Text"}
                  </span>
                </label>
              ))}
          </div>
          <p className="help-copy">
            {selected.length} field{selected.length === 1 ? "" : "s"} selected.
            Unselected fields are not included in the screen response.
          </p>
        </>
      )}
      {step === 3 && (
        <>
          <div className="wizard-intro">
            <h3>Give this content a name</h3>
            <p>
              Your design will use <strong>{selected.length} fields</strong>{" "}
              from <strong>{table}</strong>,{" "}
              {single ? "one record at a time" : "as a collection"}.
            </p>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Data binding name</span>
              <input
                aria-label="Data binding name"
                value={name}
                placeholder={table || "products"}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <small>
                A short collection name, such as products or current_user.
              </small>
            </label>
            <label className="field">
              <span>Who can see these records?</span>
              <select
                aria-label="Record access"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="public">Everyone using this app</option>
                <option value="user">Only the signed-in owner</option>
              </select>
            </label>
          </div>
          {scope === "user" && (
            <label className="field">
              <span>User ownership column</span>
              <select
                aria-label="User ownership column"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                {columns.map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
              </select>
              <small>
                Studio matches this field to the verified app user. This screen
                will require sign-in.
              </small>
            </label>
          )}
          <div className="wizard-filter-heading">
            <h4>
              Filter records <span>Optional</span>
            </h4>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setFilters([
                  ...filters,
                  { column: selected[0], op: "eq", value: "", optional: false },
                ])
              }
            >
              <Plus size={14} />
              Add filter
            </button>
          </div>
          {!filters.length && (
            <p className="help-copy">
              For example: category contains “shoes”, or price is less than 100.
            </p>
          )}
          {filters.map((f, index) => (
            <div className="friendly-filter" key={index}>
              <div className="filter-sentence">
                <select
                  aria-label="Filter column"
                  value={f.column}
                  onChange={(e) =>
                    updateFilter(index, { column: e.target.value })
                  }
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {friendlyName(c.name)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Filter operator"
                  value={f.op}
                  onChange={(e) => updateFilter(index, { op: e.target.value })}
                >
                  {Object.entries(operators).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Remove filter"
                  onClick={() =>
                    setFilters(filters.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Value comes from</span>
                  <select
                    aria-label="Filter value source"
                    value={
                      f.value && typeof f.value === "object"
                        ? f.value.from
                        : "literal"
                    }
                    onChange={(e) =>
                      updateFilter(index, {
                        value:
                          e.target.value === "literal"
                            ? ""
                            : {
                                from: e.target.value,
                                key: e.target.value === "auth" ? "id" : "",
                              },
                      })
                    }
                  >
                    <option value="literal">A fixed value</option>
                    <option value="query">A screen parameter</option>
                    <option value="auth">The signed-in user</option>
                  </select>
                </label>
                <label className="field">
                  <span>
                    {typeof f.value === "object" ? "Parameter name" : "Value"}
                  </span>
                  {f.value && typeof f.value === "object" ? (
                    <select
                      aria-label="Filter value"
                      value={f.value.key}
                      onChange={(e) =>
                        updateFilter(index, {
                          value: { ...f.value, key: e.target.value },
                        })
                      }
                    >
                      <option value="">
                        Choose{" "}
                        {f.value.from === "auth"
                          ? "user field"
                          : "screen parameter"}
                      </option>
                      {f.value.from === "auth"
                        ? ["id", "name", "email"].map((key) => (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          ))
                        : Object.keys(parameters).map((key) => (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          ))}
                      {f.value.key &&
                        !Object.hasOwn(parameters, f.value.key) &&
                        f.value.from === "query" && (
                          <option value={f.value.key}>
                            {f.value.key} (define in Screen setup)
                          </option>
                        )}
                    </select>
                  ) : (
                    <input
                      aria-label="Filter value"
                      value={
                        f.value && typeof f.value === "object"
                          ? f.value.key
                          : String(f.value ?? "")
                      }
                      onChange={(e) =>
                        updateFilter(index, {
                          value:
                            f.value && typeof f.value === "object"
                              ? { ...f.value, key: e.target.value }
                              : e.target.value,
                        })
                      }
                    />
                  )}
                  {f.value?.from === "query" &&
                    !Object.keys(parameters).length && (
                      <small>
                        Add incoming values in Screens → Setup → Incoming
                        values, then choose one here.
                      </small>
                    )}
                </label>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  aria-label="Optional"
                  checked={f.optional}
                  onChange={(e) =>
                    updateFilter(index, { optional: e.target.checked })
                  }
                />
                Ignore this filter when no value is provided
              </label>
            </div>
          ))}
          <details className="query-delivery">
            <summary>Sorting & number of records</summary>
            <div className="field-grid three">
              <label className="field">
                <span>Order by</span>
                <select
                  aria-label="Order by"
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                >
                  {columns.map((c) => (
                    <option key={c.name}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Direction</span>
                <select
                  aria-label="Direction"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  <option value="asc">A → Z / Low → High</option>
                  <option value="desc">Z → A / High → Low</option>
                </select>
              </label>
              <label className="field">
                <span>Records per page</span>
                <input
                  type="number"
                  aria-label="Page size"
                  min="1"
                  max="100"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </label>
            </div>
          </details>
          <div className="query-result-summary">
            <Database size={17} />
            <span>
              {friendlyName(name || table)}
              <small>
                {single ? "One record" : "Collection"} ·{" "}
                {selected.map(friendlyName).join(", ")}
              </small>
            </span>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions wizard-navigation">
        {step > 1 && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setStep(step - 1);
              setError("");
            }}
          >
            Back
          </button>
        )}
        <button className="primary" disabled={loading || !table}>
          {step === 3 ? (
            initial ? (
              "Save changes"
            ) : (
              "Connect data source"
            )
          ) : (
            <>
              Continue
              <ChevronRight size={15} />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
