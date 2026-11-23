import { hydrate, duplicateWidget } from "./model.js";
import { widgetNames } from "./widget-catalog.js";
import { MappingEditor } from "./ValueMapping.jsx";
import React, { useEffect, useState } from "react";
const dartExample = `import 'package:flutter/material.dart';
import 'package:spacewidget/spacewidget.dart';

// Add to your compiled host: widgets: spaceCustomWidgets({'greeting': buildGreeting})
Widget buildGreeting(SpaceBuildContext space) {
  final data = space.read('data', {}) as Map;
  return Text('Hello, ' + (data['name'] ?? 'friend').toString());
}
`;
const jsExample = `(context) => ({
  greeting: 'Hello ' + (context.user.name || 'friend'),
  total: (context.input.items || []).reduce((sum, item) => sum + item.price * item.quantity, 0)
})`;
export function AIStudio({
  api,
  app,
  doc,
  change,
  run,
  notify,
  setTab,
  setScreenId,
  setComponentId,
  canEdit = true,
}) {
  const [settings, setSettings] = useState([]),
    [provider, setProvider] = useState("openai"),
    [model, setModel] = useState(""),
    [apiKey, setKey] = useState(""),
    [target, setTarget] = useState("screen"),
    [prompt, setPrompt] = useState(""),
    [proposal, setProposal] = useState(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/api/ai/settings")
      .then((value) => {
        setSettings(value);
        setModel(value.find((s) => s.provider === provider)?.model || "");
      })
      .catch((e) => notify(e.message));
  }, [app.id]);
  return (
    <section className="inspector-section platform-panel">
      <h2>Design with AI</h2>
      <p>
        Describe a screen or reusable component. Review the result, apply it to
        your draft and refine it in the Flutter canvas. Nothing is published
        automatically.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await api(`/api/ai/settings/${provider}`, "PUT", {
              apiKey,
              model,
            });
            setSettings(result);
            setKey("");
            notify("Encrypted AI settings saved for your Studio account.");
          });
        }}
      >
        <h3>Your AI account</h3>
        <p>
          Your key stays encrypted on the server. Design prompts and the app
          theme are sent to your selected provider; database records and app
          credentials are excluded. Provider usage is billed to your account.
        </p>
        <label className="field">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setModel(
                settings.find((s) => s.provider === e.target.value)?.model ||
                  "",
              );
              setKey("");
            }}
          >
            {["openai", "gemini", "claude"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Model ID from your provider account</span>
          <input
            required
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Enter an available model ID"
          />
        </label>
        <label className="field">
          <span>
            API key{" "}
            {settings.some((s) => s.provider === provider)
              ? "(saved; leave blank to keep)"
              : ""}
          </span>
          <input
            aria-label="AI provider API key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <button className="secondary">Save AI settings</button>
        {settings.some((s) => s.provider === provider) && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              run(async () =>
                setSettings(
                  await api(`/api/ai/settings/${provider}`, "PUT", {
                    remove: true,
                  }),
                ),
              )
            }
          >
            Remove key
          </button>
        )}
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          run(async () => {
            try {
              setProposal(
                await api(`/api/apps/${app.id}/ai/design`, "POST", {
                  provider,
                  target,
                  prompt,
                }),
              );
            } finally {
              setBusy(false);
            }
          });
        }}
      >
        <label className="field">
          <span>Create</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="screen">New screen</option>
            <option value="component">Reusable component</option>
          </select>
        </label>
        <label className="field">
          <span>Describe your design</span>
          <textarea
            required
            minLength={5}
            maxLength={8000}
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A course overview with a title, progress card, lesson list and continue button…"
          />
        </label>
        <button
          className="primary"
          disabled={busy || !settings.some((s) => s.provider === provider)}
        >
          {busy ? "Designing…" : "Generate design"}
        </button>
      </form>
      {proposal && (
        <article className="resource-card ai-proposal">
          <div>
            <h3>{proposal.name}</h3>
            <p>
              New {proposal.target} · {proposal.provider} / {proposal.model}.
              Apply to inspect it in the Flutter canvas. Undo restores your
              draft.
            </p>
            <details>
              <summary>Review widget structure</summary>
              <pre>{JSON.stringify(proposal.tree, null, 2)}</pre>
            </details>
            <button
              className="primary"
              disabled={!canEdit}
              onClick={() => {
                const id = `ai-${Date.now().toString(36)}`;
                const tree = duplicateWidget(
                  hydrate(structuredClone(proposal.tree), widgetNames),
                );
                change((d) => {
                  if (proposal.target === "component")
                    d.components.push({
                      id,
                      name: proposal.name,
                      defaults: proposal.state,
                      tree,
                    });
                  else
                    d.screens.push({
                      id,
                      name: proposal.name,
                      public: true,
                      state: proposal.state,
                      queries: [],
                      tree,
                    });
                });
                if (proposal.target === "component") {
                  setComponentId(id);
                  setTab("components");
                } else {
                  setScreenId(id);
                  setTab("screens");
                }
                setProposal(null);
                notify(
                  "AI design added to the draft. Review it before publishing.",
                );
              }}
            >
              Apply to draft
            </button>
            {!canEdit && (
              <p>
                Switch the Screens canvas to Draft before applying this design.
              </p>
            )}
            <button className="secondary" onClick={() => setProposal(null)}>
              Discard
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
export function CodeStudio({ api, app, run, notify, onUseFunction }) {
  const [modules, setModules] = useState([]),
    [codeId, setId] = useState("calculate-total"),
    [kind, setKind] = useState("javascript"),
    [source, setSource] = useState(jsExample),
    [input, setInput] = useState('{"items":[{"price":42,"quantity":2}]}'),
    [result, setResult] = useState(null),
    [revision, setRevision] = useState(undefined);
  useEffect(() => {
    api(`/api/apps/${app.id}/code`)
      .then(setModules)
      .catch((e) => notify(e.message));
  }, [app.id]);
  return (
    <section className="inspector-section platform-panel">
      <h2>Custom code</h2>
      <p>
        Extend your app with compiled Flutter widgets or server-side JavaScript
        calculations.
      </p>
      <div className="card-list">
        {modules.map((m) => (
          <article key={m.id} className="resource-card">
            <div>
              <h3>{m.id}</h3>
              <p>
                {m.kind} · Draft {m.revision}
                {m.published_revision
                  ? ` · Enabled ${m.published_revision}`
                  : ""}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                setId(m.id);
                setKind(m.kind);
                setSource(m.source);
                setRevision(m.revision);
                setResult(null);
              }}
            >
              Edit
            </button>
            {m.kind === "dart" && (
              <a
                className="secondary"
                href={`/api/apps/${app.id}/code/${m.id}/export`}
              >
                Download Dart
              </a>
            )}
          </article>
        ))}
      </div>
      <button
        className="secondary"
        onClick={() => {
          setId("new-function");
          setRevision(undefined);
          setSource(jsExample);
          setKind("javascript");
          setResult(null);
        }}
      >
        New module
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const list = await api(
              `/api/apps/${app.id}/code/${codeId}`,
              "PUT",
              { kind, source, revision },
            );
            setModules(list);
            setRevision(list.find((m) => m.id === codeId)?.revision);
            notify("Code draft saved.");
          });
        }}
      >
        <label className="field">
          <span>Module ID</span>
          <input
            required
            pattern="[a-z][a-z0-9_-]{0,63}"
            value={codeId}
            onChange={(e) => {
              setId(e.target.value);
              setRevision(undefined);
            }}
          />
        </label>
        <label className="field">
          <span>Runs in</span>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setSource(e.target.value === "dart" ? dartExample : jsExample);
              setRevision(undefined);
            }}
          >
            <option value="javascript">Backend JavaScript</option>
            <option value="dart">Flutter host (Dart)</option>
          </select>
        </label>
        <p>
          {kind === "dart"
            ? "Download and compile this source into your Flutter app. Register its builder with spaceCustomWidgets, then add a Custom Widget layer with the same builder name. Native Flutter cannot execute downloaded Dart; changing it requires rebuilding the host and preview."
            : "Return JSON from a synchronous (context) => result function. context.input contains the request body; context.user is set by the authenticated server. Functions run in an isolated engine with a 500 ms CPU deadline and 16 MB heap. Use saved HTTP endpoints for network integrations. No environment, files or Node APIs are exposed."}
        </p>
        <label className="field">
          <span>Source</span>
          <textarea
            aria-label="Code source"
            className="code-editor"
            required
            rows={15}
            spellCheck={false}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <button className="primary">Save code draft</button>
        {kind === "javascript" && (
          <>
            <label className="field">
              <span>Test input (JSON)</span>
              <textarea
                aria-label="Test input (JSON)"
                rows={3}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                run(async () =>
                  setResult(
                    await api(
                      `/api/apps/${app.id}/code/${codeId}/test`,
                      "POST",
                      { source, input: JSON.parse(input) },
                    ),
                  ),
                )
              }
            >
              Test draft
            </button>
            <button
              type="button"
              className="secondary"
              disabled={
                !revision ||
                modules.find((m) => m.id === codeId)?.source !== source
              }
              onClick={() =>
                run(async () => {
                  setModules(
                    await api(
                      `/api/apps/${app.id}/code/${codeId}/publish`,
                      "POST",
                      { revision },
                    ),
                  );
                  notify(
                    "Function ready. Publish the app to deploy it with your screens.",
                  );
                })
              }
            >
              Enable saved function
            </button>
            <p>
              In Screens, choose Interactions → Run backend function → {codeId}.
              Pass input fields with the value pickers and save the response to
              a content name. You can also use it under Screen setup → When
              screen opens. App users must sign in. Publish the app to deploy
              this enabled version.
            </p>
            <button
              type="button"
              className="secondary"
              disabled={
                !modules.find((m) => m.id === codeId)?.published_revision ||
                modules.find((m) => m.id === codeId)?.source !== source
              }
              onClick={() => onUseFunction(codeId)}
            >
              Use when the selected screen opens
            </button>
          </>
        )}
      </form>
      {result && <pre role="status">{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}
export function AppIntegrations({ api, app, doc, run, notify }) {
  const [links, setLinks] = useState([]),
    [name, setName] = useState(""),
    [url, setUrl] = useState(""),
    [users, setUsers] = useState([]),
    [userId, setUserId] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [screenId, setScreenId] = useState(doc.initialScreen),
    [destinations, setDestinations] = useState([]),
    [query, setQuery] = useState({}),
    [preview, setPreview] = useState(null);
  useEffect(() => {
    let active = true;
    api(`/api/apps/${app.id}/push/destinations`)
      .then((screens) => {
        if (!active) return;
        setDestinations(screens);
        setScreenId((current) =>
          screens.some((s) => s.id === current)
            ? current
            : screens[0]?.id || "",
        );
        setPreview(null);
      })
      .catch((e) => active && notify(e.message));
    return () => {
      active = false;
    };
  }, [app.id, app.published]);
  useEffect(() => {
    api(`/api/apps/${app.id}/app-links`)
      .then((v) => setLinks(v.links))
      .catch((e) => notify(e.message));
    api(`/api/apps/${app.id}/users`)
      .then((v) => setUsers(Array.isArray(v) ? v : v.users || []))
      .catch((e) => notify(e.message));
  }, [app.id]);
  return (
    <section className="inspector-section platform-panel">
      <h2>External apps</h2>
      <p>
        Save approved app destinations. Flutter actions use{" "}
        <code>openExternalApp</code> with a link name. HTTPS, email and
        telephone links are supported; custom schemes also need the host’s
        allowedAppSchemes configuration and platform app-link setup.
      </p>
      {links.map((l) => (
        <article key={l.name} className="resource-card">
          <div>
            <h3>{l.name}</h3>
            <p>{l.url}</p>
          </div>
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                const v = await api(`/api/apps/${app.id}/app-links`, "PUT", {
                  links: links.filter((x) => x.name !== l.name),
                });
                setLinks(v.links);
              })
            }
          >
            Remove
          </button>
        </article>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const v = await api(`/api/apps/${app.id}/app-links`, "PUT", {
              links: [...links.filter((l) => l.name !== name), { name, url }],
            });
            setLinks(v.links);
            setName("");
            setUrl("");
          });
        }}
      >
        <label className="field">
          <span>Link name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Support"
          />
        </label>
        <label className="field">
          <span>Destination</span>
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://wa.me/…"
          />
        </label>
        <button className="secondary">Save app link</button>
      </form>
      <h2>Send a notification</h2>
      <p>
        Choose one app user and a published destination. The in-app notification
        is queued; Firebase delivers it to that user’s registered devices when
        configured.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const v = await api(`/api/apps/${app.id}/push/send`, "POST", {
              userId,
              title,
              body,
              screenId,
              query,
            });
            setPreview(v.preview);
          });
        }}
      >
        <label className="field">
          <span>App user</span>
          <select
            required
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPreview(null);
            }}
          >
            <option value="">Select user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Title</span>
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <label className="field">
          <span>Message</span>
          <textarea
            required
            maxLength={1000}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setPreview(null);
            }}
          />
        </label>
        <label className="field">
          <span>Open screen</span>
          <select
            value={screenId}
            onChange={(e) => {
              setScreenId(e.target.value);
              setQuery({});
              setPreview(null);
            }}
          >
            {destinations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <MappingEditor
          label="Notification destination values"
          definitions={
            destinations.find((s) => s.id === screenId)?.parameters || {}
          }
          value={query}
          fixedOnly
          onChange={(value) => {
            setQuery(value);
            setPreview(null);
          }}
        />
        {!destinations.length && (
          <p className="help-copy">
            Publish the app to choose a notification destination. Draft screens
            cannot receive notifications.
          </p>
        )}
        <button className="secondary" disabled={!destinations.length}>
          Preview notification
        </button>
      </form>
      {preview && (
        <article className="resource-card">
          <div>
            <h3>{preview.title}</h3>
            <p>{preview.body}</p>
            <p>
              To {users.find((u) => u.id === preview.userId)?.email} · Open{" "}
              {preview.screenId}
            </p>
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  await api(`/api/apps/${app.id}/push/send`, "POST", {
                    ...preview,
                    confirm: true,
                  });
                  setPreview(null);
                  notify("Notification queued.");
                })
              }
            >
              Send this notification
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
