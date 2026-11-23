import { PreviewContentEditor } from "./PreviewContentEditor.jsx";
import React, { useState } from "react";
import { ActionEditor } from "./ActionEditor.jsx";
import { effective, navigationDestinations } from "../shared/screens.mjs";
import { uid } from "../shared/document.mjs";
import { screenSources } from "./designer-model.js";
import { MappingEditor } from "./ValueMapping.jsx";
import { screenUsage } from "../shared/authoring.mjs";

export function ScreenSetup({
  doc,
  screen,
  section,
  change,
  onOpenContent,
  onOpenScreen,
  onSelect,
  requests = [],
  sample = {},
  users = [],
  previewUser = "",
  onPreviewUser = () => {},
  onRefreshUsers = () => {},
}) {
  const [parameterName, setParameterName] = useState("");
  const patch = (values) =>
    change((d) =>
      Object.assign(
        d.screens.find((s) => s.id === screen.id),
        values,
      ),
    );
  const owner = doc.navigation?.screenId;
  const items = navigationDestinations(doc);
  const references = screenUsage(doc, screen.id);
  const sourceCount =
    (screen.queries?.length || 0) +
    (screen.httpQueries?.length || 0) +
    (screen.loader ? 1 : 0);
  if (section === "data")
    return (
      <div className="inspector-section">
        <h3>Content for {screen.name}</h3>
        {!screen.public && (
          <>
            <label className="field">
              <span>Preview as app user</span>
              <select
                aria-label="Preview as app user"
                value={previewUser}
                onChange={(e) => onPreviewUser(e.target.value)}
              >
                <option value="">Choose an app user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name || user.email}
                  </option>
                ))}
              </select>
            </label>
            <button className="text-link" onClick={onRefreshUsers}>
              Refresh app users
            </button>
            <p className="help-copy">
              Only this user's permitted records appear in Live content. Create
              a test account in the connected app if the list is empty.
            </p>
          </>
        )}
        <p className="help-copy">
          Choose a database or API source in Content. Then select a text, image
          or collection layer and choose the field to display.
        </p>
        {screenSources(screen, sample)
          .filter((s) => !s.virtual || s.select.length)
          .map((s) => (
            <div className="screen-source-card" key={s.id}>
              <strong>{s.id}</strong>
              <small>
                {s.single ? "One record" : "Repeated collection"} ·{" "}
                {s.select.length} fields
              </small>
            </div>
          ))}
        <button className="primary full" onClick={onOpenContent}>
          Manage screen content ({sourceCount})
        </button>
        <PreviewContentEditor
          value={screen.previewData}
          onChange={(previewData) => patch({ previewData })}
        />
      </div>
    );
  if (section === "actions")
    return (
      <div className="inspector-section">
        <h3>When screen opens</h3>
        <p className="help-copy">
          Runs once after the screen loads. Add an API request, run a backend
          function, set a value or chain steps. Refreshing content does not
          repeat this event.
        </p>
        <ActionEditor
          label="When screen opens"
          value={screen.onLoad}
          onChange={(onLoad) => patch({ onLoad })}
          screens={doc.screens}
          components={doc.components}
          forms={[]}
          onSelect={onSelect}
          requests={requests}
          parameters={screen.parameters || {}}
        />
        <div className="info-note">
          Opening events run in the connected app. The editing canvas never runs
          them automatically.
        </div>
      </div>
    );
  return (
    <div className="screen-setup">
      <section className="inspector-section">
        <h3>Screen setup</h3>
        <label className="field">
          <span>Screen name</span>
          <input
            aria-label="Screen name"
            value={screen.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={!screen.public}
            disabled={screen.queries?.some((q) => q.scope === "user")}
            onChange={(e) => patch({ public: !e.target.checked })}
          />
          Require sign-in
        </label>
        {screen.queries?.some((q) => q.scope === "user") && (
          <small>
            This screen uses private records. Change their access in Content
            before making the screen public.
          </small>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            checked={doc.initialScreen === screen.id}
            onChange={() =>
              change((d) => {
                d.initialScreen = screen.id;
              })
            }
          />
          Open this screen when the app starts
        </label>
        <p className="help-copy">
          Select a layer to style it. Use Content to connect records and
          Interactions to configure opening events.
        </p>
      </section>
      <section className="inspector-section">
        <h3>Incoming values</h3>
        <p className="help-copy">
          Define values this screen receives, such as productId. The Open screen
          action will show these fields. Filters can use them as Screen
          parameters.
        </p>
        {Object.entries(screen.parameters || {}).map(([name, field]) => (
          <div className="parameter-card" key={name}>
            <strong>{name}</strong>
            <label className="field">
              <span>{name} type</span>
              <select
                aria-label={`${name} type`}
                value={field.type}
                onChange={(e) =>
                  patch({
                    parameters: {
                      ...screen.parameters,
                      [name]: { ...field, type: e.target.value },
                    },
                  })
                }
              >
                {["string", "number", "integer", "boolean"].map((type) => (
                  <option key={type} value={type}>
                    {type === "string"
                      ? "Text"
                      : type === "integer"
                        ? "Whole number"
                        : type === "boolean"
                          ? "True / false"
                          : "Number"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Default value for {name} (optional)</span>
              <input
                aria-label={`Default value for ${name}`}
                value={field.defaultValue ?? ""}
                onChange={(e) => {
                  const next = { ...field };
                  if (e.target.value === "") delete next.defaultValue;
                  else next.defaultValue = e.target.value;
                  patch({ parameters: { ...screen.parameters, [name]: next } });
                }}
              />
              <small>
                Used in the app when the screen opens without this value.
              </small>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) =>
                  patch({
                    parameters: {
                      ...screen.parameters,
                      [name]: { ...field, required: e.target.checked },
                    },
                  })
                }
              />
              Required when opening
            </label>
            <label className="field">
              <span>Preview example for {name}</span>
              <input
                aria-label={`Preview example for ${name}`}
                value={field.sampleValue ?? ""}
                onChange={(e) =>
                  patch({
                    parameters: {
                      ...screen.parameters,
                      [name]: { ...field, sampleValue: e.target.value },
                    },
                  })
                }
              />
            </label>
            <button
              className="text-link"
              onClick={() => {
                const parameters = { ...screen.parameters };
                delete parameters[name];
                patch({ parameters });
              }}
            >
              Remove {name}
            </button>
          </div>
        ))}
        <label className="field">
          <span>New screen parameter</span>
          <input
            aria-label="New screen parameter"
            value={parameterName}
            onChange={(e) => setParameterName(e.target.value)}
            placeholder="productId"
          />
        </label>
        <button
          className="secondary full"
          disabled={
            !/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(parameterName) ||
            ["constructor", "prototype", "__proto__"].includes(parameterName) ||
            Object.hasOwn(screen.parameters || {}, parameterName)
          }
          onClick={() => {
            patch({
              parameters: {
                ...screen.parameters,
                [parameterName]: { type: "string", required: false },
              },
            });
            setParameterName("");
          }}
        >
          Add parameter
        </button>
      </section>
      <section className="inspector-section">
        <h3>Shared bottom navigation</h3>
        <p className="help-copy">
          Design the bar once on a layout screen. Each item opens its assigned
          screen with the same bar and the correct selected item.
        </p>
        {!owner ? (
          <>
            <button
              className="secondary full"
              disabled={
                doc.screens.length < 2 ||
                !["scaffold"].includes(
                  screen.tree.type || screen.tree.widgetType,
                )
              }
              onClick={() =>
                change((d) => {
                  d.navigation = { screenId: screen.id };
                  const s = d.screens.find((x) => x.id === screen.id);
                  const existing = effective(s.tree).bottomNavigationBar;
                  const bar = {
                    ...effective(existing),
                    type: "navigationBar",
                    id: existing?.id || uid(),
                    destinations: [s, ...d.screens.filter((x) => x.id !== s.id)]
                      .slice(0, 4)
                      .map((x, i) => ({
                        label: x.name,
                        icon: i ? "person" : "home",
                        screenId: x.id,
                      })),
                  };
                  s.tree = {
                    ...effective(s.tree),
                    props: undefined,
                    style: undefined,
                    bottomNavigationBar: bar,
                  };
                })
              }
            >
              Use this screen as navigation layout
            </button>
            {doc.screens.length < 2 && (
              <small>Create at least two screens first.</small>
            )}
          </>
        ) : (
          <>
            <p className="help-copy">
              Layout:{" "}
              <strong>{doc.screens.find((s) => s.id === owner)?.name}</strong>
            </p>
            {owner !== screen.id && (
              <button
                className="secondary full"
                onClick={() => onOpenScreen(owner)}
              >
                Edit shared navigation
              </button>
            )}
            {owner === screen.id &&
              items.map((item, i) => (
                <div className="parameter-card" key={i}>
                  <label className="field">
                    <span>Tab {i + 1} label</span>
                    <input
                      aria-label={`Tab ${i + 1} label`}
                      value={item.label || ""}
                      onChange={(e) =>
                        change((d) => {
                          effective(
                            d.screens.find((s) => s.id === owner).tree,
                          ).bottomNavigationBar.destinations[i].label =
                            e.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Tab {i + 1} screen</span>
                    <select
                      aria-label={`Tab ${i + 1} screen`}
                      value={item.screenId || ""}
                      onChange={(e) =>
                        change((d) => {
                          const bar = effective(
                            d.screens.find((s) => s.id === owner).tree,
                          ).bottomNavigationBar;
                          bar.destinations[i].screenId = e.target.value;
                        })
                      }
                    >
                      {doc.screens.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={items.some(
                            (x, j) => j !== i && x.screenId === s.id,
                          )}
                        >
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {Object.keys(
                    doc.screens.find((s) => s.id === item.screenId)
                      ?.parameters || {},
                  ).length > 0 && (
                    <MappingEditor
                      label={`Tab ${i + 1} parameters`}
                      definitions={
                        doc.screens.find((s) => s.id === item.screenId)
                          ?.parameters
                      }
                      parameters={screen.parameters || {}}
                      value={item.query}
                      onChange={(query) =>
                        change((d) => {
                          effective(
                            d.screens.find((s) => s.id === owner).tree,
                          ).bottomNavigationBar.destinations[i].query = query;
                        })
                      }
                    />
                  )}
                  <button
                    className="text-link"
                    disabled={items.length <= 2}
                    onClick={() =>
                      change((d) => {
                        const bar = effective(
                          d.screens.find((s) => s.id === owner).tree,
                        ).bottomNavigationBar;
                        bar.destinations.splice(i, 1);
                      })
                    }
                  >
                    Remove tab
                  </button>
                </div>
              ))}
            {owner === screen.id && (
              <>
                <button
                  className="secondary full"
                  disabled={
                    items.length >= 5 ||
                    !doc.screens.some(
                      (s) => !items.some((i) => i.screenId === s.id),
                    )
                  }
                  onClick={() =>
                    change((d) => {
                      const s = d.screens.find(
                        (s) => !items.some((i) => i.screenId === s.id),
                      );
                      effective(
                        d.screens.find((s) => s.id === owner).tree,
                      ).bottomNavigationBar.destinations.push({
                        label: s.name,
                        icon: "home",
                        screenId: s.id,
                      });
                    })
                  }
                >
                  Add tab
                </button>
                <small>
                  Select the bottom navigation layer to change icons, colors and
                  appearance.
                </small>
                <button
                  className="text-link"
                  onClick={() =>
                    change((d) => {
                      delete d.navigation;
                    })
                  }
                >
                  Stop sharing this bar
                </button>
              </>
            )}
          </>
        )}
      </section>
      {doc.screens.length > 1 && (
        <section className="inspector-section">
          <button
            className="danger-text"
            disabled={
              owner === screen.id ||
              items.some((i) => i.screenId === screen.id) ||
              references.length > 0
            }
            onClick={() => {
              if (!window.confirm(`Delete ${screen.name}?`)) return;
              change((d) => {
                d.screens = d.screens.filter((s) => s.id !== screen.id);
                if (d.initialScreen === screen.id)
                  d.initialScreen = d.screens[0].id;
              });
            }}
          >
            Delete screen
          </button>
          {(owner === screen.id ||
            items.some((i) => i.screenId === screen.id)) && (
            <small>
              Remove this screen from shared navigation before deleting it.
            </small>
          )}
          {!!references.length && (
            <small>
              Update links in {references.join(", ")} before deleting this
              screen.
            </small>
          )}
        </section>
      )}
    </div>
  );
}
