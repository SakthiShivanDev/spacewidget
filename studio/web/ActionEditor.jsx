import { MappingEditor, ValueInput } from "./ValueMapping.jsx";
import React, { useEffect, useState } from "react";
import { WidgetPicker } from "./WidgetPicker.jsx";
import { widget, uid } from "./model.js";
import { operationInputs } from "../shared/authoring.mjs";
import { integrationChoices } from "./integration-choices.js";

export const actionChoices = [
  ["navigate", "Open screen"],
  ["replace", "Replace current screen"],
  ["bottomSheet", "Open bottom sheet"],
  ["dialog", "Show alert / dialog"],
  ["pop", "Close sheet, dialog or screen"],
  ["changeTab", "Switch tab"],
  ["openDrawer", "Open drawer"],
  ["request", "Call API endpoint"],
  ["function", "Run backend function"],
  ["submit", "Validate and submit form"],
  ["operation", "Run app integration"],
  ["refresh", "Reload screen data"],
  ["set", "Set a value"],
  ["toggle", "Toggle a value"],
  ["increment", "Increase a number"],
  ["append", "Add to a list"],
  ["snackbar", "Show message"],
  ["callback", "Call host action"],
  ["if", "Only if a condition is true"],
  ["sequence", "Run several actions"],
];
export function newAction(type, screens = []) {
  if (!type) return undefined;
  if (type === "if")
    return {
      type,
      condition: true,
      then: { type: "snackbar", message: "Done" },
    };
  if (type === "sequence") return [{ type: "snackbar", message: "Done" }];
  if (["dialog", "bottomSheet"].includes(type))
    return {
      type,
      dismissible: true,
      content:
        type === "dialog"
          ? {
              type: "alertDialog",
              id: uid(),
              title: "Confirmation",
              content: {
                type: "text",
                id: uid(),
                text: "Continue with this action?",
              },
              actions: [
                {
                  type: "textButton",
                  id: uid(),
                  label: "Cancel",
                  action: { type: "pop", result: false },
                },
                {
                  type: "filledButton",
                  id: uid(),
                  label: "Continue",
                  action: { type: "pop", result: true },
                },
              ],
            }
          : {
              type: "padding",
              id: uid(),
              padding: 24,
              child: {
                type: "column",
                id: uid(),
                mainAxisSize: "min",
                children: [
                  {
                    type: "text",
                    id: uid(),
                    text: "Your bottom sheet",
                    fontSize: 22,
                  },
                  {
                    type: "textButton",
                    id: uid(),
                    label: "Close",
                    action: { type: "pop" },
                  },
                ],
              },
            },
    };
  if (["navigate", "replace"].includes(type))
    return { type, source: `/runtime/screens/${screens[0]?.id || "main"}` };
  if (type === "function")
    return {
      type: "request",
      method: "POST",
      source: "/runtime/functions/",
      resultPath: "response",
    };
  if (type === "request" || type === "submit")
    return {
      type,
      method: "POST",
      source: "/runtime/",
      resultPath: "response",
      onFailure: {
        type: "snackbar",
        message: "Unable to complete the request. Please try again.",
      },
    };
  if (type === "operation")
    return { type, name: "openUrl", data: { url: "https://example.com" } };
  if (type === "snackbar") return { type, message: "Done" };
  if (type === "changeTab") return { type, index: 0 };
  if (["set", "toggle", "increment", "append"].includes(type))
    return {
      type,
      path: "value",
      ...(type === "set" || type === "append" ? { value: "" } : {}),
    };
  return { type };
}
function JsonInput({ label, value, onChange }) {
  const initial = JSON.stringify(value ?? {}, null, 2);
  const [text, setText] = useState(initial),
    [error, setError] = useState("");
  useEffect(() => {
    setText(initial);
    setError("");
  }, [initial]);
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        aria-label={label}
        rows={3}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError("");
          } catch {
            setError("Enter valid JSON. Your last valid value is kept.");
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
export function ActionEditor({
  value,
  onChange,
  label = "On tap",
  screens = [],
  components = [],
  requests = [],
  parameters = {},
  forms = [],
  editingId,
  onSelect = () => {},
  depth = 0,
}) {
  const [advanced, setAdvanced] = useState(false);
  const list = Array.isArray(value) && value.length > 0,
    action = typeof value === "object" && !list && value ? value : {};
  const type = list
    ? "sequence"
    : typeof value === "string"
      ? "callback"
      : action.type === "request" &&
          action.source?.startsWith("/runtime/functions/")
        ? "function"
        : action.type || "";
  const patch = (change) => onChange({ ...action, ...change });
  const savedRequest = requests.find(
    (r) => (r.source || `/runtime/actions/${r.id}`) === action.source,
  );
  const contract = savedRequest?.operation
    ? operationInputs(savedRequest)
    : null;
  const integration = integrationChoices.find(
    ([id]) => id === (type === "submit" ? action.operation : action.name),
  );
  const input = (key, title, hint, numeric = false) => (
    <label className="field">
      <span>{title}</span>
      <input
        aria-label={title}
        type={numeric ? "number" : "text"}
        value={action[key] ?? ""}
        onChange={(e) =>
          patch({ [key]: numeric ? Number(e.target.value) : e.target.value })
        }
      />
      {hint && <small>{hint}</small>}
    </label>
  );
  const nested = (key, title) =>
    depth < 3 && (
      <details>
        <summary>{title}</summary>
        <ActionEditor
          {...{
            screens,
            components,
            requests,
            parameters,
            forms,
            editingId,
            onSelect,
          }}
          label={title}
          value={action[key]}
          onChange={(v) => patch({ [key]: v })}
          depth={depth + 1}
        />
      </details>
    );
  return (
    <div className="action-editor" data-action-editor={label}>
      <label className="field">
        <span>{label}</span>
        <select
          aria-label={label}
          value={type}
          onChange={(e) => onChange(newAction(e.target.value, screens))}
        >
          <option value="">No action</option>
          {actionChoices.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          {type && !actionChoices.some(([id]) => id === type) && (
            <option value={type}>{type}</option>
          )}
        </select>
      </label>
      {list ? (
        <>
          {value.map((entry, i) => (
            <div className="collection-item" key={i}>
              <ActionEditor
                {...{
                  screens,
                  components,
                  requests,
                  parameters,
                  forms,
                  editingId,
                  onSelect,
                }}
                label={`Step ${i + 1}`}
                value={entry}
                depth={depth + 1}
                onChange={(v) =>
                  onChange(
                    value.map((x, j) => (j === i ? v : x)).filter(Boolean),
                  )
                }
              />
              <div className="collection-actions">
                <button
                  type="button"
                  disabled={!i}
                  onClick={() => {
                    const next = [...value];
                    [next[i - 1], next[i]] = [next[i], next[i - 1]];
                    onChange(next);
                  }}
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  Remove step
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="secondary full"
            onClick={() => onChange([...value, newAction("snackbar")])}
          >
            Add action step
          </button>
          <small>
            Steps run in order. A failed or cancelled request stops later steps.
          </small>
        </>
      ) : (
        <>
          {["navigate", "replace"].includes(type) && (
            <>
              <label className="field">
                <span>Destination screen</span>
                <select
                  aria-label="Destination screen"
                  value={
                    action.source?.startsWith("/runtime/screens/")
                      ? action.source.slice(17)
                      : ""
                  }
                  onChange={(e) =>
                    patch({
                      source: `/runtime/screens/${e.target.value}`,
                      query: {},
                    })
                  }
                >
                  <option value="">Select screen</option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <MappingEditor
                label="Screen parameters"
                value={action.query}
                definitions={
                  screens.find(
                    (s) => action.source === `/runtime/screens/${s.id}`,
                  )?.parameters || {}
                }
                parameters={parameters}
                onChange={(query) => patch({ query })}
              />
              {Object.keys(action.query || {}).some(
                (key) =>
                  !Object.hasOwn(
                    screens.find(
                      (s) => action.source === `/runtime/screens/${s.id}`,
                    )?.parameters || {},
                    key,
                  ),
              ) && (
                <details>
                  <summary>Existing undeclared parameters</summary>
                  <MappingEditor
                    label="Other parameters"
                    value={action.query}
                    parameters={parameters}
                    onChange={(query) => patch({ query })}
                  />
                </details>
              )}
              {type === "navigate" && (
                <label className="field">
                  <span>Reload when returning</span>
                  <input
                    type="checkbox"
                    checked={action.refreshOnReturn === true}
                    onChange={(e) =>
                      patch({ refreshOnReturn: e.target.checked })
                    }
                  />
                </label>
              )}
            </>
          )}
          {["dialog", "bottomSheet"].includes(type) && (
            <>
              <label className="field">
                <span>Overlay content</span>
                <WidgetPicker
                  label="Overlay content widget"
                  value={
                    action.content?.type === "component"
                      ? `component:${action.content.componentId}`
                      : action.content?.type
                  }
                  components={components}
                  editingId={editingId}
                  onChange={(t) =>
                    patch({
                      content: t.startsWith("component:")
                        ? {
                            type: "component",
                            id: uid(),
                            componentId: t.slice(10),
                            values: {},
                          }
                        : widget(t),
                    })
                  }
                />
              </label>
              {action.content?.id && (
                <button
                  type="button"
                  className="secondary full"
                  onClick={() => onSelect(action.content.id)}
                >
                  Edit overlay content in Layers
                </button>
              )}
              <small>
                Double-click the Flutter preview, then tap the trigger to open
                this overlay. Add Close actions to its buttons.
              </small>
              <label className="field">
                <span>Allow outside tap to dismiss</span>
                <input
                  type="checkbox"
                  checked={action.dismissible !== false}
                  onChange={(e) => patch({ dismissible: e.target.checked })}
                />
              </label>
              {input(
                "resultPath",
                "Save close result to",
                "Optional state path, for example confirmed",
              )}
              {nested("onDismiss", "After closing")}
            </>
          )}
          {type === "if" && (
            <>
              <label className="field">
                <span>Condition</span>
                <select
                  aria-label="Condition type"
                  value={
                    typeof action.condition === "string"
                      ? "binding"
                      : String(action.condition ?? false)
                  }
                  onChange={(e) =>
                    patch({
                      condition:
                        e.target.value === "binding"
                          ? "{{confirmed}}"
                          : e.target.value === "true",
                    })
                  }
                >
                  <option value="binding">A true / false data value</option>
                  <option value="true">Always true</option>
                  <option value="false">Always false</option>
                </select>
              </label>
              {typeof action.condition === "string" &&
                input(
                  "condition",
                  "Condition data binding",
                  "For a confirmation dialog use {{event.result}}. For a request use its saved response, for example {{response.order.pending}}.",
                )}
              {nested("then", "When true")}
              {nested("else", "When false")}
            </>
          )}
          {type === "pop" &&
            (action.result && typeof action.result === "object" ? (
              <JsonInput
                label="Close result"
                value={action.result}
                onChange={(result) => patch({ result })}
              />
            ) : (
              <ValueInput
                label="Close result"
                value={action.result ?? ""}
                onChange={(result) => patch({ result })}
              />
            ))}
          {type === "changeTab" && (
            <>
              {input(
                "index",
                "Tab number (starts at 0)",
                "Place this trigger inside the Default Tab Controller.",
                true,
              )}
            </>
          )}
          {type === "openDrawer" && (
            <label className="field">
              <span>Drawer side</span>
              <select
                value={action.end ? "end" : "start"}
                onChange={(e) => patch({ end: e.target.value === "end" })}
              >
                <option value="start">Start / left</option>
                <option value="end">End / right</option>
              </select>
            </label>
          )}
          {["request", "submit", "operation", "function"].includes(type) && (
            <>
              {type === "submit" && (
                <label className="field">
                  <span>Submit to</span>
                  <select
                    aria-label="Submit to"
                    value={action.operation ? "integration" : "endpoint"}
                    onChange={(e) =>
                      onChange(
                        e.target.value === "integration"
                          ? {
                              ...action,
                              operation: "authLogin",
                              source: undefined,
                            }
                          : {
                              ...action,
                              operation: undefined,
                              source: "/runtime/",
                            },
                      )
                    }
                  >
                    <option value="endpoint">Server API endpoint</option>
                    <option value="integration">
                      App integration (including authentication)
                    </option>
                  </select>
                </label>
              )}
              {type === "operation" ||
              (type === "submit" && action.operation) ? (
                <>
                  <label className="field">
                    <span>Integration</span>
                    <select
                      aria-label="Integration name"
                      value={
                        (type === "submit" ? action.operation : action.name) ||
                        ""
                      }
                      onChange={(e) =>
                        patch({
                          [type === "submit" ? "operation" : "name"]:
                            e.target.value,
                          data: {},
                        })
                      }
                    >
                      {!integration && (
                        <option value={action.name || action.operation || ""}>
                          {action.name ||
                            action.operation ||
                            "Choose integration"}
                        </option>
                      )}
                      {integrationChoices.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <small>
                    The host app must register this integration. Unconfigured
                    services show an error.
                  </small>
                </>
              ) : (
                <>
                  {
                    <label className="field">
                      <span>
                        {type === "function"
                          ? "Backend function"
                          : "Saved API or database operation"}
                      </span>
                      <select
                        value={savedRequest ? action.source : ""}
                        onChange={(e) =>
                          patch({
                            source: e.target.value,
                            method:
                              requests.find(
                                (r) =>
                                  (r.source || `/runtime/actions/${r.id}`) ===
                                  e.target.value,
                              )?.method || "POST",
                          })
                        }
                      >
                        <option value="">Custom endpoint</option>
                        {requests
                          .filter((r) =>
                            type === "function"
                              ? r.kind === "function"
                              : r.kind !== "function",
                          )
                          .map((r) => (
                            <option
                              key={r.source || `/runtime/actions/${r.id}`}
                              value={r.source || `/runtime/actions/${r.id}`}
                              disabled={r.disabled}
                            >
                              {r.name || r.id}
                            </option>
                          ))}
                      </select>
                    </label>
                  }
                  {type === "function" && (
                    <p className="help-copy">
                      Create and enable a JavaScript function in App settings →
                      Custom code. Choose it here, pass input fields below and
                      save its response for your layers. Publish the app to
                      deploy the selected function version.
                    </p>
                  )}
                  <details>
                    <summary>Custom endpoint</summary>
                    {input(
                      "source",
                      "API endpoint",
                      "Relative to your server. Keep secret keys in API connections.",
                    )}
                  </details>
                  <label className="field">
                    <span>HTTP method</span>
                    <select
                      aria-label="HTTP method"
                      value={
                        action.method || (type === "submit" ? "POST" : "GET")
                      }
                      onChange={(e) => patch({ method: e.target.value })}
                    >
                      {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {type === "submit" && (
                <label className="field">
                  <span>Form to validate</span>
                  <input
                    aria-label="Form to validate"
                    list="space-forms"
                    value={action.form || ""}
                    placeholder="Nearest parent form"
                    onChange={(e) =>
                      patch({ form: e.target.value || undefined })
                    }
                  />
                  <datalist id="space-forms">
                    {forms.map((f) => (
                      <option key={f.id} value={f.id} />
                    ))}
                  </datalist>
                  <small>
                    Only valid forms are sent. Input names become request
                    fields.
                  </small>
                </label>
              )}
              {!["authOAuth", "authApple"].includes(integration?.[0]) && (
                <MappingEditor
                  label="Request data"
                  value={action.data}
                  definitions={contract?.data || integration?.[2] || undefined}
                  emptyMessage={
                    integration
                      ? "This integration does not need input values."
                      : undefined
                  }
                  suggested={type === "submit" ? "form" : undefined}
                  parameters={parameters}
                  onChange={(data) => patch({ data })}
                />
              )}
              {["authOAuth", "authApple"].includes(integration?.[0]) && (
                <>
                  <label className="field">
                    <span>After OAuth returns</span>
                    <select
                      aria-label="After OAuth returns"
                      value={action.data?.screenId || ""}
                      onChange={(e) =>
                        patch({
                          data: e.target.value
                            ? {
                                ...action.data,
                                screenId: e.target.value,
                                query: {},
                              }
                            : {},
                        })
                      }
                    >
                      <option value="">Open the app's start screen</option>
                      {screens.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {action.data?.screenId && (
                    <MappingEditor
                      label="OAuth destination parameters"
                      value={action.data.query}
                      definitions={
                        screens.find((s) => s.id === action.data.screenId)
                          ?.parameters || {}
                      }
                      parameters={parameters}
                      onChange={(query) =>
                        patch({ data: { ...action.data, query } })
                      }
                    />
                  )}
                  <small>
                    The browser launch starts sign-in. This destination opens
                    only after the provider callback has been verified.
                  </small>
                </>
              )}
              {type !== "operation" && (
                <MappingEditor
                  label="Query parameters"
                  value={action.query}
                  definitions={contract?.query}
                  emptyMessage="This operation does not need query parameters."
                  parameters={parameters}
                  onChange={(query) => patch({ query })}
                />
              )}
              {input(
                "resultPath",
                "Save response to",
                "Bind widgets to this path, for example response.items",
              )}
              {type !== "operation" && (
                <label className="field">
                  <span>If API returns a widget screen</span>
                  <select
                    aria-label="API widget presentation"
                    value={action.presentation || "replace"}
                    onChange={(e) => patch({ presentation: e.target.value })}
                  >
                    <option value="replace">Update current screen</option>
                    <option value="dialog">Open as dialog</option>
                    <option value="bottomSheet">Open as bottom sheet</option>
                  </select>
                </label>
              )}
              {nested("onSuccess", "When successful")}
              {nested("onFailure", "When request fails")}
            </>
          )}
          {["set", "toggle", "increment", "append"].includes(type) &&
            input(
              "path",
              "State value path",
              "Use app. for state shared across screens.",
            )}
          {["set", "append"].includes(type) &&
            (typeof action.value === "object" && action.value !== null ? (
              <JsonInput
                label="New value"
                value={action.value ?? ""}
                onChange={(v) => patch({ value: v })}
              />
            ) : (
              <ValueInput
                label="New value"
                value={action.value ?? ""}
                parameters={parameters}
                onChange={(value) => patch({ value })}
              />
            ))}
          {type === "increment" &&
            input(
              "by",
              "Increase by",
              "Use a negative number to decrease.",
              true,
            )}
          {type === "snackbar" && input("message", "Message")}
          {type === "callback" && input("name", "Host action name")}
        </>
      )}
      {type && (
        <>
          <button
            className="text-link"
            type="button"
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? "Hide action JSON" : "Advanced action JSON"}
          </button>
          {advanced && (
            <JsonInput
              label={`${label} JSON`}
              value={value}
              onChange={onChange}
            />
          )}
        </>
      )}
    </div>
  );
}
