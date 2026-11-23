import React, { useEffect, useState } from "react";
import { MappingEditor } from "./ValueMapping.jsx";
export function HttpServicesPanel({
  api,
  app,
  screen,
  change,
  run,
  notify,
  setSample,
}) {
  const [services, setServices] = useState([]),
    [serviceId, setServiceId] = useState("catalog-api"),
    [baseUrl, setBaseUrl] = useState(""),
    [endpointId, setEndpointId] = useState("products"),
    [path, setPath] = useState("/products"),
    [method, setMethod] = useState("GET"),
    [isPublic, setPublic] = useState(false),
    [headerName, setHeaderName] = useState("Authorization"),
    [secret, setSecret] = useState(""),
    [sourceId, setSourceId] = useState("apiProducts"),
    [selected, setSelected] = useState(""),
    [users, setUsers] = useState([]),
    [testUser, setTestUser] = useState(""),
    [testResult, setTestResult] = useState(null),
    [testInputs, setTestInputs] = useState({}),
    [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => {
    let active = true;
    api(`/api/apps/${app.id}/users`)
      .then((v) => {
        if (active) setUsers(v);
      })
      .catch((e) => notify(e.message));
    api(`/api/apps/${app.id}/http-services`)
      .then((v) => {
        if (active) setServices(v);
      })
      .catch((e) => notify(e.message));
    return () => {
      active = false;
    };
  }, [app.id]);
  const endpoints = services.flatMap((s) =>
    s.endpoints
      .filter((e) => e.method === "GET" && (!screen.public || e.public))
      .map((e) => ({ ...e, serviceId: s.id, key: `${s.id}/${e.id}` })),
  );
  return (
    <section className="inspector-section http-services-panel">
      <h2>API connections</h2>
      <p>
        Connect once, test the response, then choose which screen uses it.
        Credentials stay private on your server.
      </p>
      <details>
        <summary>Server setup</summary>
        <p>
          The deployment owner approves API hosts in STUDIO_HTTP_HOSTS. Save a
          credential header below when the API needs a server key. User identity
          comes from the verified app session.
        </p>
      </details>
      <label className="field">
        <span>Test as app user (required for private endpoints)</span>
        <select value={testUser} onChange={(e) => setTestUser(e.target.value)}>
          <option value="">Public visitor</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
      </label>
      {testResult && (
        <details open>
          <summary>API response</summary>
          <pre style={{ maxHeight: 320, overflow: "auto" }}>
            {JSON.stringify(testResult, null, 2)}
          </pre>
          {(screen.httpQueries || [])
            .filter(
              (source) =>
                source.serviceId === testResult.serviceId &&
                source.endpointId === testResult.endpointId,
            )
            .map((source) => (
              <button
                type="button"
                className="secondary"
                key={source.id}
                onClick={() => {
                  setSample?.((current) => ({
                    ...current,
                    [source.id]: testResult.data,
                  }));
                  notify(
                    `Sample content updated for ${source.id}. Select a layer → Content to choose a response field.`,
                  );
                }}
              >
                Use response as {source.id} sample
              </button>
            ))}
        </details>
      )}
      {services.map((service) => (
        <article className="resource-card" key={service.id}>
          <div>
            <h3>{service.id}</h3>
            <p>{service.baseUrl}</p>
            <button
              className="secondary"
              onClick={() => {
                setServiceId(service.id);
                setBaseUrl(service.baseUrl);
                setSecret("");
                setEndpointId("");
                setPath("/");
                setMethod("GET");
                setPublic(false);
                setEditorOpen(true);
              }}
            >
              Add endpoint to this service
            </button>
            {service.endpoints.map((endpoint) => {
              const testKey = `${service.id}/${endpoint.id}`,
                input = testInputs[testKey] || {};
              const updateInput = (patch) =>
                setTestInputs((current) => ({
                  ...current,
                  [testKey]: { ...current[testKey], ...patch },
                }));
              return (
                <div className="api-endpoint-card" key={endpoint.id}>
                  <strong>{endpoint.id}</strong>
                  <p>
                    {endpoint.method} {endpoint.path}
                  </p>
                  <details>
                    <summary>App endpoint</summary>
                    <code>
                      {endpoint.method} /runtime/http/{service.id}/{endpoint.id}
                    </code>{" "}
                  </details>
                  <small>
                    {endpoint.public ? "Public read" : "Signed-in user"}
                  </small>
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => {
                      setServiceId(service.id);
                      setBaseUrl(service.baseUrl);
                      setEndpointId(endpoint.id);
                      setPath(endpoint.path);
                      setMethod(endpoint.method);
                      setPublic(endpoint.public);
                      setSecret("");
                      setEditorOpen(true);
                    }}
                  >
                    Edit endpoint
                  </button>
                  <details>
                    <summary>Test inputs for {endpoint.id}</summary>
                    <MappingEditor
                      label={`${endpoint.id} test query`}
                      value={input.query}
                      fixedOnly
                      onChange={(query) => updateInput({ query })}
                    />
                    {endpoint.method !== "GET" && (
                      <MappingEditor
                        label={`${endpoint.id} test body`}
                        value={input.body}
                        fixedOnly
                        onChange={(body) => updateInput({ body })}
                      />
                    )}
                  </details>
                  {endpoint.method !== "GET" && (
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={!!input.confirm}
                        onChange={(e) =>
                          updateInput({ confirm: e.target.checked })
                        }
                      />
                      Allow this test to change data at the connected API
                    </label>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={endpoint.method !== "GET" && !input.confirm}
                    onClick={() =>
                      run(async () =>
                        setTestResult({
                          serviceId: service.id,
                          endpointId: endpoint.id,
                          ...(await api(
                            `/api/apps/${app.id}/http-services/${service.id}/${endpoint.id}/test`,
                            "POST",
                            { ...input, userId: testUser || undefined },
                          )),
                        }),
                      )
                    }
                  >
                    Test endpoint
                  </button>
                </div>
              );
            })}
          </div>
        </article>
      ))}
      <details
        open={editorOpen}
        onToggle={(e) => setEditorOpen(e.currentTarget.open)}
      >
        <summary>Add an HTTP service</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const value = await api(
                `/api/apps/${app.id}/http-services/${encodeURIComponent(serviceId)}`,
                "PUT",
                {
                  baseUrl,
                  headers: secret ? { [headerName]: secret } : undefined,
                  endpoints: [
                    ...(
                      services.find((s) => s.id === serviceId)?.endpoints || []
                    ).filter((e) => e.id !== endpointId),
                    { id: endpointId, path, method, public: isPublic },
                  ],
                },
              );
              setServices(value);
              setSecret("");
              notify("API service saved. Credentials stay on the server.");
            });
          }}
        >
          <label className="field">
            <span>Service ID</span>
            <input
              aria-label="HTTP service ID"
              value={serviceId}
              required
              pattern="[a-z][a-z0-9_-]*"
              onChange={(e) => setServiceId(e.target.value)}
            />
          </label>
          <label className="field">
            <span>API origin</span>
            <input
              aria-label="API origin"
              value={baseUrl}
              placeholder="https://api.example.com"
              required
              type="url"
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Endpoint ID</span>
            <input
              aria-label="Endpoint ID"
              value={endpointId}
              required
              pattern="[a-z][a-z0-9_-]*"
              onChange={(e) => setEndpointId(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Endpoint path</span>
            <input
              aria-label="Endpoint path"
              value={path}
              required
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Method</span>
            <select
              aria-label="Endpoint method"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                if (e.target.value !== "GET") setPublic(false);
              }}
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={isPublic}
              disabled={method !== "GET"}
              onChange={(e) => setPublic(e.target.checked)}
            />
            Allow public reads
          </label>
          <label className="field">
            <span>Credential header name (optional)</span>
            <input
              aria-label="Credential header name"
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Credential header value</span>
            <input
              aria-label="Credential header value"
              type="password"
              autoComplete="new-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="For example Bearer …"
            />
            <small>
              Stored encrypted on the server. Never included in app JSON.
            </small>
          </label>
          <button className="primary">Save API endpoint</button>
          {services.some((s) => s.id === serviceId) && (
            <small>
              Other endpoints and existing credentials are preserved. Enter a
              credential only to replace the saved headers.
            </small>
          )}
        </form>
      </details>
      <h3>Connected to {screen.name}</h3>
      {!endpoints.length && (
        <p className="help-copy">
          {services.length && screen.public
            ? "This public screen can use public GET endpoints. Enable public reads on the endpoint, or require sign-in in Screen setup to use private content."
            : "Save a GET endpoint above, then connect it to this screen. Use other request methods in a button or form interaction."}
        </p>
      )}
      {(screen.httpQueries || []).map((source) => (
        <article className="resource-card" key={source.id}>
          <div>
            <strong>{source.id}</strong>
            <p>
              {source.serviceId} / {source.endpointId}
            </p>
            <small>
              Select a layer → Content → choose a field from this response. For
              a list, select a repeated collection and choose the items field.
            </small>
          </div>
          <MappingEditor
            label={`${source.id} API parameters`}
            value={source.query}
            parameters={screen.parameters || {}}
            server
            onChange={(query) =>
              change((d) => {
                d.screens
                  .find((s) => s.id === screen.id)
                  .httpQueries.find((s) => s.id === source.id).query = query;
              })
            }
          />
          <button
            type="button"
            className="secondary"
            onClick={() =>
              change((d) => {
                const s = d.screens.find((s) => s.id === screen.id);
                s.httpQueries = s.httpQueries.filter((q) => q.id !== source.id);
              })
            }
          >
            Disconnect source
          </button>
        </article>
      ))}
      {endpoints.length > 0 && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const endpoint = endpoints.find(
              (e) => e.key === (selected || endpoints[0]?.key),
            );
            if (!endpoint) return;
            if (
              [...screen.queries, ...(screen.httpQueries || [])].some(
                (q) => q.id === sourceId,
              )
            )
              return notify("Choose a unique screen data name.");
            change((d) => {
              const s = d.screens.find((s) => s.id === screen.id);
              (s.httpQueries ||= []).push({
                id: sourceId,
                serviceId: endpoint.serviceId,
                endpointId: endpoint.id,
                query: {},
              });
            });
            notify(
              "Source connected. Preview with Live content, then select a layer and choose its Content field.",
            );
          }}
        >
          <label className="field">
            <span>Saved API endpoint</span>
            <select
              aria-label="Saved API endpoint"
              value={selected || endpoints[0]?.key}
              onChange={(e) => setSelected(e.target.value)}
            >
              {endpoints.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.key}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name to use in widgets</span>
            <input
              aria-label="API data source name"
              value={sourceId}
              required
              pattern="[a-z][a-zA-Z0-9_]*"
              onChange={(e) => setSourceId(e.target.value)}
            />
          </label>
          <button className="secondary">Connect API to screen</button>
        </form>
      )}
    </section>
  );
}
