import React, { useEffect, useState } from "react";
import { friendlyName } from "../../designer-model.js";
import { operationInputs } from "../../../shared/authoring.mjs";

const operators = {
  eq: "is equal to",
  ne: "is not equal to",
  contains: "contains",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
};
const defaultFilter = () => ({
  column: "id",
  op: "eq",
  value: { from: "body", key: "id" },
  optional: false,
});
const columnType = (column) =>
  /bool/i.test(column.type)
    ? "boolean"
    : /int/i.test(column.type)
      ? "integer"
      : /real|numeric|decimal|double/i.test(column.type)
        ? "number"
        : "string";

export function DatabaseOperationBuilder({
  initial,
  api,
  app,
  connections,
  onSubmit,
  existingNames = [],
}) {
  const [name, setName] = useState(initial?.id || "");
  const [connection, setConnection] = useState(
    initial?.connectionId || connections[0]?.id || "",
  );
  const [table, setTable] = useState(initial?.table || "");
  const [tables, setTables] = useState([]),
    [columns, setColumns] = useState([]);
  const [operation, setOperation] = useState(initial?.operation || "update");
  const [owner, setOwner] = useState(initial?.ownerColumn || "user_id");
  const [fields, setFields] = useState(initial?.fields || {});
  const [filters, setFilters] = useState(initial?.filters || [defaultFilter()]);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setTables([]);
    setColumns([]);
    setError("");
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
  }, [app.id, connection]);
  useEffect(() => {
    let active = true;
    setColumns([]);
    if (!table || !tables.includes(table)) return;
    setLoading(true);
    setError("");
    api(`/api/apps/${app.id}/connections/${connection}/tables/${table}`)
      .then((list) => {
        if (!active) return;
        setColumns(list);
        setOwner((current) =>
          list.some((c) => c.name === current)
            ? current
            : list.find((c) => /user_id|owner_id/.test(c.name))?.name || "",
        );
        setFields((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([, f]) =>
              list.some((c) => c.name === f.column),
            ),
          ),
        );
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [app.id, connection, table, tables]);
  const updateFilter = (index, patch) =>
    setFilters((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );
  const resource = {
    id: name,
    connectionId: connection,
    table,
    operation,
    ownerColumn: owner,
    fields: operation === "delete" ? {} : fields,
    filters: operation === "insert" ? [] : filters,
  };
  const inputs = operationInputs(resource);
  return (
    <form
      className="operation-builder"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (name !== initial?.id && existingNames.includes(name))
          return setError(
            "An operation with this name already exists. Choose another name.",
          );
        if (loading || !tables.includes(table))
          return setError("Choose a database and table first.");
        if (!columns.some((c) => c.name === owner))
          return setError(
            "Choose the field that identifies the owner of a record.",
          );
        if (operation !== "delete" && !Object.keys(fields).length)
          return setError("Choose at least one editable field.");
        if (
          filters.some(
            (f) =>
              !columns.some((c) => c.name === f.column) ||
              (typeof f.value === "object" && !f.value?.key),
          )
        )
          return setError("Complete each record filter.");
        onSubmit(resource);
      }}
    >
      <p className="help-copy">
        Create a reusable way to save or remove records. Attach it to a button
        or form in Interactions; its input fields will appear automatically.
      </p>
      <div className="field-grid">
        <label className="field">
          <span>Operation name</span>
          <input
            aria-label="Operation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            pattern="[a-z][a-z0-9_-]{0,63}"
            placeholder="save-profile"
          />
        </label>
        <label className="field">
          <span>What should happen?</span>
          <select
            aria-label="Operation"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="insert">Create a record</option>
            <option value="update">Update records</option>
            <option value="delete">Delete records</option>
          </select>
        </label>
        <label className="field">
          <span>Database connection</span>
          <select
            aria-label="Database connection"
            value={connection}
            onChange={(e) => {
              setConnection(e.target.value);
              setTable("");
              setFields({});
              setFilters([defaultFilter()]);
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
            value={table}
            disabled={loading && !tables.length}
            onChange={(e) => {
              setTable(e.target.value);
              setFields({});
              setFilters([defaultFilter()]);
            }}
          >
            <option value="">Choose a table</option>
            {tables.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Which field identifies the record's owner?</span>
        <select
          aria-label="User ownership column"
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setFields((current) =>
              Object.fromEntries(
                Object.entries(current).filter(
                  ([, f]) => f.column !== e.target.value,
                ),
              ),
            );
          }}
        >
          <option value="">Choose an ownership field</option>
          {columns.map((c) => (
            <option key={c.name} value={c.name}>
              {friendlyName(c.name)}
            </option>
          ))}
        </select>
        <small>
          Studio sets this field from the signed-in user. Users can only change
          their own records.
        </small>
      </label>
      {operation !== "delete" && (
        <section className="operation-fields">
          <h3>Values the app can send</h3>
          <p className="help-copy">
            Choose editable fields. Mark a value required when every submission
            must include it.
          </p>
          {columns
            .filter((c) => !["id", owner].includes(c.name))
            .map((c) => (
              <div className="operation-field-row" key={c.name}>
                <label className="check-field">
                  <input
                    aria-label={`Allow ${c.name}`}
                    type="checkbox"
                    checked={!!fields[c.name]}
                    onChange={(e) =>
                      setFields((current) => {
                        const next = { ...current };
                        if (e.target.checked)
                          next[c.name] = {
                            column: c.name,
                            type: columnType(c),
                            required: false,
                            maxLength: 1000,
                          };
                        else delete next[c.name];
                        return next;
                      })
                    }
                  />
                  {friendlyName(c.name)}
                </label>
                {fields[c.name] && (
                  <>
                    <select
                      aria-label={`${c.name} value type`}
                      value={fields[c.name].type}
                      onChange={(e) =>
                        setFields({
                          ...fields,
                          [c.name]: { ...fields[c.name], type: e.target.value },
                        })
                      }
                    >
                      {[
                        ["string", "Text"],
                        ["number", "Number"],
                        ["integer", "Whole number"],
                        ["boolean", "True / false"],
                      ].map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <label className="check-field">
                      <input
                        aria-label={`Require ${c.name}`}
                        type="checkbox"
                        checked={fields[c.name].required}
                        onChange={(e) =>
                          setFields({
                            ...fields,
                            [c.name]: {
                              ...fields[c.name],
                              required: e.target.checked,
                            },
                          })
                        }
                      />
                      Required
                    </label>
                  </>
                )}
              </div>
            ))}
        </section>
      )}
      {operation !== "insert" && (
        <section>
          <h3>Which records should change?</h3>
          <p className="help-copy">
            These filters narrow the signed-in user's records. With no filters,
            this operation changes all of their records in this table.
          </p>
          {filters.map((f, i) => (
            <div className="operation-filter" key={i}>
              <select
                aria-label={`Filter ${i + 1} column`}
                value={f.column}
                onChange={(e) => updateFilter(i, { column: e.target.value })}
              >
                {columns.map((c) => (
                  <option key={c.name} value={c.name}>
                    {friendlyName(c.name)}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Filter ${i + 1} operator`}
                value={f.op}
                onChange={(e) => updateFilter(i, { op: e.target.value })}
              >
                {!operators[f.op] && <option value={f.op}>{f.op}</option>}
                {Object.entries(operators).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Filter ${i + 1} value source`}
                value={
                  typeof f.value === "object" && f.value
                    ? f.value.from
                    : "literal"
                }
                onChange={(e) =>
                  updateFilter(i, {
                    value:
                      e.target.value === "literal"
                        ? ""
                        : {
                            from: e.target.value,
                            key: e.target.value === "auth" ? "id" : f.column,
                          },
                  })
                }
              >
                <option value="body">Value sent by the button or form</option>
                <option value="auth">Signed-in user</option>
                <option value="query">Request query parameter</option>
                <option value="literal">Fixed value</option>
              </select>
              {f.value?.from === "auth" ? (
                <select
                  aria-label={`Filter ${i + 1} user field`}
                  value={f.value.key}
                  onChange={(e) =>
                    updateFilter(i, {
                      value: { from: "auth", key: e.target.value },
                    })
                  }
                >
                  {["id", "name", "email"].map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
              ) : (
                <label className="field">
                  <span>
                    {typeof f.value === "object" ? "Input name" : "Value"}
                  </span>
                  <input
                    aria-label={`Filter ${i + 1} value`}
                    value={
                      typeof f.value === "object"
                        ? f.value?.key || ""
                        : (f.value ?? "")
                    }
                    onChange={(e) =>
                      updateFilter(i, {
                        value:
                          typeof f.value === "object"
                            ? { ...f.value, key: e.target.value }
                            : e.target.value,
                      })
                    }
                    required
                    pattern={
                      typeof f.value === "object"
                        ? "[a-zA-Z_][a-zA-Z0-9_]*"
                        : undefined
                    }
                  />
                </label>
              )}
              <button
                type="button"
                className="text-link"
                onClick={() => setFilters(filters.filter((_, j) => j !== i))}
              >
                Remove filter
              </button>
            </div>
          ))}
          <button
            className="secondary"
            type="button"
            onClick={() => setFilters([...filters, defaultFilter()])}
          >
            Add record filter
          </button>
        </section>
      )}
      <div className="info-note">
        <strong>Inputs shown on buttons and forms</strong>
        <p>
          {Object.keys(inputs.data).join(", ") || "No submitted values"}
          {Object.keys(inputs.query).length
            ? ` · Query parameters: ${Object.keys(inputs.query).join(", ")}`
            : ""}
        </p>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="primary" disabled={loading}>
          {initial ? "Save operation" : "Create operation"}
        </button>
      </div>
    </form>
  );
}
