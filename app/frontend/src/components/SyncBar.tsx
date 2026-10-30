import { changesText, useLanguage, useT } from "../i18n";
import { useSync } from "../sync";

/** A small bar while changes wait to reach the server (or couldn't be saved). */
export function SyncBar() {
  const t = useT();
  const lang = useLanguage();
  const sync = useSync();
  const changes = changesText(sync.pending, lang);

  if (sync.failed.length) {
    return (
      <div className="sync-bar error-bar" role="alert">
        <span>
          {t("syncFailed", { changes: changesText(sync.failed.length, lang) })}{" "}
          {[...new Set(sync.failed.map((f) => f.message))].join("; ")}
        </span>
        <button className="chip" onClick={sync.dismissFailed}>
          {t("ok")}
        </button>
      </div>
    );
  }
  if (!sync.online) {
    return (
      <div className="sync-bar" role="status">
        <span>📴 {sync.pending ? t("offlineWaiting", { changes }) : t("offline")}</span>
      </div>
    );
  }
  if (!sync.pending) return null;
  return (
    <div className="sync-bar" role="status">
      <span>{sync.syncing ? `⏳ ${t("syncing", { changes })}` : `⏳ ${t("waiting", { changes })}`}</span>
      {!sync.syncing && (
        <button className="chip" onClick={sync.syncNow}>
          {t("retry")}
        </button>
      )}
    </div>
  );
}
