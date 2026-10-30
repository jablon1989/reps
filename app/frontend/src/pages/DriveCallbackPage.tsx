import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { errorText, useApi } from "../api";
import { useT } from "../i18n";

/** Google sends you back here after "Connect Google Drive". */
export function DriveCallbackPage() {
  const t = useT();
  const api = useApi();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return; // the code works only once (StrictMode runs effects twice)
    sent.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) {
      setError(t("driveCancelled"));
      return;
    }
    api
      .driveCallback(code, state)
      .then(() => navigate("/settings", { replace: true }))
      .catch((e) => setError(errorText(e, t)));
  }, [api, navigate, t]);

  return (
    <section className="page">
      <h1>{t("driveTitle")}</h1>
      <div className="card stack">
        {error ? (
          <>
            <p className="error">{error}</p>
            <button className="btn" onClick={() => navigate("/settings", { replace: true })}>
              ‹ {t("tabSettings")}
            </button>
          </>
        ) : (
          <p className="muted">{t("driveFinishing")}</p>
        )}
      </div>
    </section>
  );
}
