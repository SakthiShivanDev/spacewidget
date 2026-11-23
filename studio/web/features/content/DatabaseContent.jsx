import React, { useEffect, useState } from "react";
import {
  Database,
  LayoutList,
  KeyRound,
  Type,
  ShieldCheck,
  Plus,
  Trash2,
} from "lucide-react";
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function IconButton({ title, children, ...props }) {
  return (
    <button type="button" aria-label={title} title={title} {...props}>
      {children}
    </button>
  );
}
export function DataPage({
  api,
  app,
  doc,
  connections,
  screen,
  change,
  setModal,
  run,
  notify,
  setSample,
  sample,
  save,
  dirty,
  onInsertList,
  onBuildCollection,
  onLoadRecords,
  previewUser,
  setPreviewUser,
  users,
  setUsers,
}) {
  const [connection, setConnection] = useState(connections[0]?.id || ""),
    [tables, setTables] = useState([]),
    [table, setTable] = useState(""),
    [columns, setColumns] = useState([]);
  useEffect(() => {
    if (connection)
      api(`/api/apps/${app.id}/connections/${connection}/tables`)
        .then((list) => {
          setTables(list);
          setTable(list[0] || "");
        })
        .catch((e) => notify(e.message, true));
  }, [connection]);
  useEffect(() => {
    if (table)
      api(`/api/apps/${app.id}/connections/${connection}/tables/${table}`)
        .then(setColumns)
        .catch((e) => notify(e.message, true));
  }, [table, connection]);
  useEffect(() => {
    api(`/api/apps/${app.id}/users`)
      .then(setUsers)
      .catch(() => {});
  }, []);
  return (
    <>
      <details className="database-details">
        <summary>Connected databases · {connections.length}</summary>
        <div className="data-layout">
          <section className="table-card database-browser">
            <div className="card-title">
              <Database size={18} />
              <select
                aria-label="Database connection"
                value={connection}
                onChange={(e) => setConnection(e.target.value)}
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ·{" "}
                    {c.kind === "managed" ? "Managed PostgreSQL" : "PostgreSQL"}
                  </option>
                ))}
              </select>
            </div>
            <div className="database-body">
              <nav>
                {tables.map((t) => (
                  <button
                    key={t}
                    className={table === t ? "selected" : ""}
                    onClick={() => setTable(t)}
                  >
                    <LayoutList size={15} />
                    {t}
                  </button>
                ))}
              </nav>
              <div className="schema-columns">
                <div className="schema-title">
                  <h3>{table}</h3>
                  <span>{columns.length} columns</span>
                </div>
                {columns.map((c) => (
                  <div className="schema-row" key={c.name}>
                    <span>
                      {c.name === "id" ? (
                        <KeyRound size={13} />
                      ) : (
                        <Type size={13} />
                      )}
                      <strong>{c.name}</strong>
                    </span>
                    <code>{c.type.toLowerCase()}</code>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside className="data-explainer">
            <span className="eyebrow">YOUR SCREEN, YOUR DATA</span>
            <h2>
              A connection that
              <br />
              means something.
            </h2>
            <p>
              Pick the records your screen needs. The server combines its data
              sources with your widgets in a single response.
            </p>
            <div>
              <ShieldCheck size={18} />
              <span>Private records stay scoped to the signed-in user.</span>
            </div>
            <button
              className="secondary"
              onClick={() => setModal({ type: "sample" })}
            >
              Edit canvas sample data
            </button>
          </aside>
        </div>
      </details>
      <div className="section-heading">
        <div>
          <h2>Data for {screen.name}</h2>
          <p>
            1. Choose records · 2. Design a list or grid · 3. Connect fields in
            the Content inspector.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => setModal({ type: "query" })}
        >
          <Plus size={16} />
          Add data source
        </button>
      </div>
      <div className="card-list">
        {screen.queries.map((q) => (
          <article className="resource-card" key={q.id}>
            <div className="resource-icon">
              <Database size={22} />
            </div>
            <div>
              <h3>
                {q.id}
                <span className="pill neutral">
                  {q.scope === "user" ? "Current user" : "Public records"}
                </span>
              </h3>
              <p>
                {q.table} · {q.select.join(", ")} ·{" "}
                {q.single ? "One record" : `${q.limit} per page`}
              </p>
              <span className="data-source-description">
                {q.single
                  ? "Connect a field to a text or image layer."
                  : "Design one item. The app repeats it for every record."}
              </span>
            </div>
            <div className="card-actions">
              <button
                className="secondary"
                onClick={() => setModal({ type: "query", value: q })}
              >
                Edit
              </button>
              {!q.single && (
                <button
                  className="secondary"
                  onClick={() => onBuildCollection(q)}
                >
                  Build list or grid
                </button>
              )}
              {!q.single && (
                <button className="secondary" onClick={() => onInsertList(q)}>
                  Insert list
                </button>
              )}
              <button
                className="secondary"
                onClick={() => onLoadRecords(q, previewUser)}
              >
                Preview data
              </button>
              <IconButton
                title={`Delete data source ${q.id}`}
                onClick={() =>
                  change((d) => {
                    d.screens.find((s) => s.id === screen.id).queries =
                      d.screens
                        .find((s) => s.id === screen.id)
                        .queries.filter((x) => x.id !== q.id);
                  })
                }
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          </article>
        ))}
      </div>
      {!!users.length && (
        <Field label="Preview private data as this app user">
          <select
            value={previewUser}
            onChange={(e) => setPreviewUser(e.target.value)}
          >
            <option value="">Choose a test user…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!screen.queries.length && (
        <div className="empty-state">
          <Database size={28} />
          <h3>Bring your screen to life.</h3>
          <p>
            Add a data source to fetch records and bind them to your widgets.
          </p>
        </div>
      )}
    </>
  );
}
