import React, { useState } from "react";
import { nodes, uid, updateNode } from "../../../shared/model.js";
import { MappingEditor } from "../../ValueMapping.jsx";

export function SignInSetup({ doc, change, onEdit }) {
  const forms = doc.screens.flatMap((screen) =>
    nodes(screen.tree)
      .filter((n) => ["loginForm", "signUpForm"].includes(n.type))
      .map((form) => ({ screen, form })),
  );
  const targets = doc.screens.filter(
    (s) => !forms.some((f) => f.screen.id === s.id),
  );
  const [target, setTarget] = useState(""),
    [query, setQuery] = useState({}),
    [initial, setInitial] = useState(false);
  const updateDestination = (screen, form, onSuccess) =>
    change((d) => {
      const s = d.screens.find((s) => s.id === screen.id);
      s.tree = updateNode(s.tree, form.id, (n) => ({ ...n, onSuccess }));
      if (
        s.onLoad?.type === "if" &&
        s.onLoad.condition === "{{auth.signedIn}}" &&
        s.onLoad.then?.source === form.onSuccess?.source
      )
        s.onLoad.then = onSuccess;
    });
  const destination = targets.some((s) => s.id === target)
    ? target
    : targets[0]?.id;
  return (
    <section className="signin-setup table-card padded">
      <h2>Sign-in screens</h2>
      <p className="help-copy">
        Use a ready-made form for sign-in, registration and password recovery.
        Choose where the user goes after signing in. Google and Apple buttons
        appear when their providers are configured in Integrations.
      </p>
      {forms.map(({ screen, form }) => (
        <article className="resource-card" key={form.id}>
          <strong>{screen.name}</strong>
          <label className="field">
            <span>After signing in on {screen.name}</span>
            <select
              aria-label={`After signing in on ${screen.name}`}
              value={
                form.onSuccess?.source?.replace("/runtime/screens/", "") || ""
              }
              onChange={(e) =>
                updateDestination(screen, form, {
                  type: "replace",
                  source: `/runtime/screens/${e.target.value}`,
                })
              }
            >
              <option value="" disabled>
                {form.onSuccess
                  ? "Custom interaction — edit below"
                  : "Choose a destination"}
              </option>
              {doc.screens
                .filter((s) => s.id !== screen.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          {form.onSuccess?.source?.startsWith("/runtime/screens/") && (
            <MappingEditor
              label={`Sign-in values for ${screen.name}`}
              definitions={
                doc.screens.find(
                  (s) => form.onSuccess.source === `/runtime/screens/${s.id}`,
                )?.parameters || {}
              }
              value={form.onSuccess.query}
              onChange={(query) =>
                updateDestination(screen, form, { ...form.onSuccess, query })
              }
            />
          )}
          <button
            className="secondary"
            onClick={() => onEdit(screen.id, form.id)}
          >
            Edit form and interactions
          </button>
        </article>
      ))}
      {!forms.length && (
        <p className="help-copy">Your app has no sign-in form yet.</p>
      )}
      <div className="field-grid">
        <label className="field">
          <span>Destination for a new sign-in screen</span>
          <select
            aria-label="Destination for a new sign-in screen"
            value={destination || ""}
            onChange={(e) => {
              setTarget(e.target.value);
              setQuery({});
            }}
          >
            {targets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={initial}
            onChange={(e) => setInitial(e.target.checked)}
          />
          Start the app here until the user signs in
        </label>
      </div>
      <MappingEditor
        label="New sign-in destination values"
        definitions={
          targets.find((s) => s.id === destination)?.parameters || {}
        }
        value={query}
        onChange={setQuery}
      />
      <button
        className="secondary"
        disabled={!destination}
        onClick={() => {
          const screenId = `sign-in${doc.screens.some((s) => s.id === "sign-in") ? "-" + uid().slice(5) : ""}`;
          const formId = uid();
          change((d) => {
            d.screens.push({
              id: screenId,
              name: "Sign in",
              public: true,
              state: {},
              queries: [],
              onLoad: {
                type: "if",
                condition: "{{auth.signedIn}}",
                then: {
                  type: "replace",
                  source: `/runtime/screens/${destination}`,
                  query,
                },
              },
              tree: {
                type: "scaffold",
                id: uid(),
                body: {
                  type: "safeArea",
                  id: uid(),
                  child: {
                    type: "listView",
                    id: uid(),
                    padding: 24,
                    children: [
                      {
                        type: "loginForm",
                        id: formId,
                        onSuccess: {
                          type: "replace",
                          source: `/runtime/screens/${destination}`,
                          query,
                        },
                      },
                    ],
                  },
                },
              },
            });
            if (initial) d.initialScreen = screenId;
          });
          onEdit(screenId, formId);
        }}
      >
        Create sign-in screen
      </button>
      <p className="help-copy">
        Protect private pages with Require sign-in in Screen setup. These forms
        run in the connected app; the canvas displays their design.
      </p>
    </section>
  );
}
