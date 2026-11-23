import React from "react";
import { Layers, Database, Smartphone, Lock } from "lucide-react";
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function AuthScreen({ setup, invite, busy, error, onSubmit }) {
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <span className="auth-brand">
          <span className="brand-mark">
            s<span />
          </span>
          spacewidget<span className="studio-word">studio</span>
        </span>
        <div>
          <span className="eyebrow">DESIGN IT. CONNECT IT. SHIP IT.</span>
          <h1>
            Your next app.
            <br />A little more
            <br />
            <em>possible.</em>
          </h1>
          <p>
            A visual home for your screens, components,
            <br />
            and the data that makes them yours.
          </p>
          <div className="auth-diagram">
            <span>
              <Layers size={20} />
              Design
            </span>
            <i />
            <span>
              <Database size={20} />
              Connect
            </span>
            <i />
            <span>
              <Smartphone size={20} />
              Render
            </span>
          </div>
        </div>
        <small>A workspace for building with SpaceWidget.</small>
      </div>
      <div className="auth-form-side">
        <div className="auth-form-card">
          <div className="eyebrow">SPACEWIDGET STUDIO</div>
          <h2>
            {setup
              ? "Make this space yours."
              : invite
                ? "Your own space to build."
                : "Welcome back."}
          </h2>
          <p>
            {setup
              ? "Create the owner account for this server."
              : invite
                ? "Create your builder account using your invited email."
                : "Sign in to pick up where you left off."}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
            }}
          >
            {setup && (
              <Field
                label="Server setup token"
                hint="Find STUDIO_SETUP_TOKEN in your server’s private .env file."
              >
                <input
                  name="setupToken"
                  type="password"
                  required
                  autoComplete="off"
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                name="email"
                type="email"
                placeholder="you@yourcompany.com"
                required
                autoComplete="username"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                minLength={10}
                maxLength={200}
                required
                autoComplete={setup ? "new-password" : "current-password"}
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {busy
                ? "Opening workspace…"
                : setup
                  ? "Create your workspace"
                  : invite
                    ? "Create builder account"
                    : "Sign in to Studio"}
            </button>
          </form>
          <small className="auth-footnote">
            <Lock size={12} />
            Your database credentials stay on your server.
          </small>
        </div>
      </div>
    </div>
  );
}
