import { WebStorageStateStore } from "oidc-client-ts";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { loadConfig, type AppConfig } from "./config";
import { CognitoSession, DevSession } from "./session";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

function WithSession({ config, children }: { config: AppConfig; children: ReactNode }) {
  if (config.dev) return <DevSession players={config.dev.players}>{children}</DevSession>;
  const origin = window.location.origin;
  return (
    <AuthProvider
      authority={config.authority!}
      client_id={config.clientId!}
      redirect_uri={`${origin}/`}
      post_logout_redirect_uri={`${origin}/`}
      scope="openid email profile"
      // Stay logged in across browser restarts (refresh token lasts 30 days).
      userStore={new WebStorageStateStore({ store: window.localStorage })}
      automaticSilentRenew
      onSigninCallback={(user) => {
        // Go back to the page you were on before the login redirect.
        const returnTo = (user?.state as { returnTo?: string } | undefined)?.returnTo ?? "/";
        window.history.replaceState({}, document.title, returnTo);
      }}
    >
      <CognitoSession config={config}>{children}</CognitoSession>
    </AuthProvider>
  );
}

loadConfig()
  .then((config) => {
    root.render(
      <StrictMode>
        <WithSession config={config}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WithSession>
      </StrictMode>,
    );
  })
  .catch((err: Error) => {
    root.render(<div className="center-screen error">{err.message}</div>);
  });
