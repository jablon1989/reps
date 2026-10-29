import { NavLink, Route, Routes } from "react-router";
import { ApiError } from "./api";
import { LanguageProvider, browserLanguage, useT } from "./i18n";
import { MeProvider, type MeStatus } from "./me";
import { ComingSoon } from "./pages/ComingSoon";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useSession } from "./session";

export function App() {
  const session = useSession();

  if (session.loading || !session.player) {
    return (
      <LanguageProvider language={browserLanguage()}>{session.loading ? <Loading /> : <LoginPage />}</LanguageProvider>
    );
  }
  return (
    <MeProvider fallback={(s) => <NotReady status={s} />}>
      <Shell />
    </MeProvider>
  );
}

function Loading() {
  return <div className="center-screen muted">{useT()("loading")}</div>;
}

function NotReady({ status }: { status: MeStatus }) {
  const t = useT();
  const { logout } = useSession();
  if (status.kind !== "error") return <Loading />;
  const noAccess = status.error instanceof ApiError && status.error.status === 403;
  return (
    <div className="center-screen">
      <div className="card narrow">
        <h1>{noAccess ? t("noAccessTitle") : "reps"}</h1>
        <p className={noAccess ? "muted" : "error"}>{noAccess ? t("noAccessText") : status.error.message}</p>
        <div className="row">
          {!noAccess && (
            <button className="btn primary" onClick={() => window.location.reload()}>
              {t("tryAgain")}
            </button>
          )}
          <button className="btn" onClick={logout}>
            {t("logOut")}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { to: "/", icon: "🏋️", label: "tabWorkout", soon: "soonWorkout" },
  { to: "/exercises", icon: "📋", label: "tabExercises", soon: "soonExercises" },
  { to: "/stats", icon: "📈", label: "tabStats", soon: "soonStats" },
] as const;

function Shell() {
  const t = useT();
  return (
    <div className="app">
      <main className="main">
        <Routes>
          {TABS.map((tab) => (
            <Route
              key={tab.to}
              path={tab.to}
              element={<ComingSoon icon={tab.icon} title={t(tab.label)} text={t(tab.soon)} />}
            />
          ))}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="center-screen muted">{t("pageNotFound")}</div>} />
        </Routes>
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end>
            <span aria-hidden>{tab.icon}</span>
            {t(tab.label)}
          </NavLink>
        ))}
        <NavLink to="/settings">
          <span aria-hidden>⚙️</span>
          {t("tabSettings")}
        </NavLink>
      </nav>
    </div>
  );
}
