import { useCallback, useEffect, useState } from "react";
import { errorText, useApi } from "../api";
import { useLanguage, useT } from "../i18n";
import type { DriveStatus } from "../types";

function when(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language === "pl" ? "pl-PL" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Settings: connect Google Drive, see the last backup, back up now, disconnect. */
export function DriveSection() {
  const t = useT();
  const lang = useLanguage();
  const api = useApi();
  const [status, setStatus] = useState<DriveStatus>();
  const [busy, setBusy] = useState<"connect" | "export" | "disconnect">();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  const load = useCallback(() => {
    api
      .drive()
      .then(setStatus)
      .catch((e) => setMessage({ ok: false, text: errorText(e, t) }));
  }, [api, t]);
  useEffect(load, [load]);

  async function connect() {
    setBusy("connect");
    setMessage(undefined);
    try {
      window.location.href = (await api.driveConnect()).url;
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, t) });
      setBusy(undefined);
    }
  }

  async function exportNow() {
    setBusy("export");
    setMessage(undefined);
    try {
      const s = await api.driveExport();
      setStatus(s);
      setMessage({ ok: true, text: t("driveDone", { files: (s.last_files ?? []).join(", ") }) });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, t) });
      load();
    } finally {
      setBusy(undefined);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("driveDisconnectConfirm"))) return;
    setBusy("disconnect");
    try {
      await api.driveDisconnect();
      setMessage(undefined);
      load();
    } catch (e) {
      setMessage({ ok: false, text: errorText(e, t) });
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <h2>☁️ {t("driveTitle")}</h2>
      <div className="card stack drive">
        <p className="muted small">{t("driveIntro")}</p>
        {status && !status.configured && <p className="small">{t("driveNotSetUp")}</p>}
        {status?.configured && !status.connected && (
          <button className="btn primary" onClick={connect} disabled={!!busy}>
            {busy === "connect" ? t("driveConnecting") : t("driveConnect")}
          </button>
        )}
        {status?.connected && (
          <>
            <p className="small">
              ✓ {t("driveConnectedAs", { email: status.email || "Google" })}
              <br />
              <span className="muted">
                {status.last_export ? t("driveLast", { when: when(status.last_export, lang) }) : t("driveNever")}
              </span>
            </p>
            {status.last_error && <p className="error small">{t("driveProblem", { error: status.last_error })}</p>}
            <div className="row">
              <button className="btn primary" onClick={exportNow} disabled={!!busy}>
                {busy === "export" ? t("driveExporting") : t("driveExportNow")}
              </button>
              <button className="btn danger" onClick={disconnect} disabled={!!busy}>
                {t("driveDisconnect")}
              </button>
            </div>
          </>
        )}
        {message && <p className={message.ok ? "ok small" : "error small"}>{message.text}</p>}
      </div>
    </>
  );
}
