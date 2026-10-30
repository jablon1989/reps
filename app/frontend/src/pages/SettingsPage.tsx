import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { DriveSection } from "../components/DriveSection";
import { errorText, useApi } from "../api";
import { LANGUAGES, LANGUAGE_NAMES, changesText, useT } from "../i18n";
import { useMe } from "../me";
import { useSync } from "../sync";
import type { Person } from "../types";

export function SettingsPage() {
  const t = useT();
  const { me, setLanguage } = useMe();
  const sync = useSync();
  const logout = () => {
    if (
      sync.pending &&
      !window.confirm(t("logoutPending", { changes: changesText(sync.pending, me.settings.language) }))
    )
      return;
    sync.logoutAndForget();
  };

  return (
    <section className="page">
      <h1>{t("tabSettings")}</h1>

      <h2>{t("language")}</h2>
      <div className="segmented" role="radiogroup" aria-label={t("language")}>
        {LANGUAGES.map((lang) => (
          <button
            key={lang}
            role="radio"
            aria-checked={me.settings.language === lang}
            className={me.settings.language === lang ? "on" : ""}
            onClick={() => setLanguage(lang)}
          >
            {LANGUAGE_NAMES[lang]}
          </button>
        ))}
      </div>

      <h2>{t("importTitle")}</h2>
      <Link className="card link-card" to="/import">
        <span>📥 {t("importOpen")}</span>
        <span aria-hidden>›</span>
      </Link>

      <DriveSection />

      <h2>{t("account")}</h2>
      <div className="card">
        <div className="account">
          <div>
            <strong>{me.name}</strong>
            <div className="muted small">{me.email}</div>
            {me.friend && <div className="muted small">{t("friendNote")}</div>}
          </div>
          <button className="btn" onClick={logout}>
            {t("logOut")}
          </button>
        </div>
      </div>

      {me.admin && <People />}

      <p className="footer-link">
        <a href="https://pusiaczkowo.pl">🐾 {t("home")}</a>
      </p>
    </section>
  );
}

function People() {
  const t = useT();
  const api = useApi();
  const [people, setPeople] = useState<Person[]>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  const load = useCallback(() => {
    api
      .people()
      .then(setPeople)
      .catch((e: Error) => setMessage({ ok: false, text: e.message }));
  }, [api]);
  useEffect(load, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await api.invite(email.trim(), name.trim());
      setMessage({ ok: true, text: t(res.new ? "inviteSent" : "inviteExisting", { email: res.email }) });
      setName("");
      setEmail("");
      load();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, t) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>{t("adminTitle")}</h2>
      <div className="card">
        <ul className="people">
          {(people ?? []).map((p) => (
            <li key={p.email}>
              <span>
                <strong>{p.name}</strong>
                <span className="muted small"> {p.email}</span>
              </span>
              <span className="tags">
                {p.admin && <span className="pill">{t("tagAdmin")}</span>}
                {p.friend && <span className="pill">{t("tagFriend")}</span>}
                {p.status === "FORCE_CHANGE_PASSWORD" && <span className="pill dim">{t("tagInvited")}</span>}
              </span>
            </li>
          ))}
        </ul>
        <form className="invite" onSubmit={invite}>
          <p className="muted small">{t("adminIntro")}</p>
          <label>
            {t("inviteName")}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </label>
          <label>
            {t("inviteEmail")}
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className="btn primary" disabled={busy}>
            {busy ? t("inviteSending") : t("inviteSend")}
          </button>
          {message && <p className={message.ok ? "ok small" : "error small"}>{message.text}</p>}
        </form>
      </div>
    </>
  );
}
