import React, { useEffect, useState } from "react";
export function IntegrationStatus({ api, app }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api(`/api/apps/${app.id}/integrations`)
      .then((value) => {
        setStatus(value);
        setError("");
      })
      .catch((error) => setError(error.message));
  useEffect(() => {
    let active = true;
    api(`/api/apps/${app.id}/integrations`)
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [app.id]);
  return (
    <section className="inspector-section">
      <h2>App integrations</h2>
      <p>
        Check the server connection before adding integration actions to your
        widgets.
      </p>
      {error && <p role="alert">{error}</p>}
      {status && (
        <div className="card-list">
          {[
            [
              "Studio database",
              status.database,
              "PostgreSQL stores Studio accounts, definitions and app data. Configure STUDIO_DATABASE_URL; SQLite is only supported by the one-time import tool.",
            ],
            [
              "Apple sign-in",
              status.apple?.configured,
              "Configure APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CALLBACK_URL and SPACE_AUTH_RETURN_URLS. Use authApple in a widget action.",
            ],
            [
              "Razorpay",
              status.razorpay?.configured,
              "Configure RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET and RAZORPAY_RETURN_URL. Set PAYMENT_PROVIDER=razorpay and PAYMENT_CURRENCY before adding products. Register /integrations/razorpay/{appId}/webhook in Razorpay.",
            ],
            [
              "Email & password",
              true,
              "Built-in sessions, registration and refresh. Password recovery needs email delivery.",
            ],
            [
              "Email delivery",
              status.email,
              "Configure SMTP_URL and MAIL_FROM for verification and password-reset messages.",
            ],
            [
              "Google sign-in",
              status.google.configured,
              "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL and SPACE_AUTH_RETURN_URLS. Add an authOAuth action and configure app links in Flutter.",
            ],
            [
              "Stripe checkout",
              status.payments.configured,
              status.payments.demo
                ? "Local TEST mode. No money is charged. Simulated payments are always disabled in production."
                : "Configure STRIPE_SECRET_KEY, STRIPE_RETURN_URL and STRIPE_WEBHOOK_SECRET. Return links trigger server verification.",
            ],
            [
              "Push notifications",
              status.push,
              "Configure FIREBASE_SERVICE_ACCOUNT_JSON and the optional spacewidget_firebase integration in your Flutter host.",
            ],
          ].map(([name, ready, help]) => (
            <article key={name} className="resource-card">
              <div>
                <h3>
                  {name}{" "}
                  <span className="pill neutral">
                    {ready ? "Ready" : "Needs setup"}
                  </span>
                </h3>
                <p>
                  {
                    {
                      "Studio database":
                        "Stores your screens, components and accounts.",
                      "Apple sign-in":
                        "Let customers sign in with their Apple account.",
                      Razorpay: "Accept payments through Razorpay checkout.",
                      "Email & password":
                        "Use the built-in sign-in and registration screens.",
                      "Email delivery":
                        "Send verification and password recovery messages.",
                      "Google sign-in":
                        "Let customers sign in with their Google account.",
                      "Stripe checkout":
                        "Accept payments through Stripe hosted checkout.",
                      "Push notifications":
                        "Send updates to customers and open the right screen when tapped.",
                    }[name]
                  }
                </p>
                <details>
                  <summary>Server configuration</summary>
                  <p>{help}</p>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
      <button type="button" className="secondary" onClick={load}>
        Recheck integrations
      </button>
    </section>
  );
}
