import { NavLink, Route, Routes, useLocation } from "react-router";
import { ApiError } from "./api";
import { LanguageProvider, browserLanguage, useT } from "./i18n";
import { MeProvider, type MeStatus } from "./me";
import { SyncBar } from "./components/SyncBar";
import { TimerBar } from "./components/TimerBar";
import { ExercisesProvider } from "./exercises";
import { HistoryProvider } from "./history";
import { ExerciseStatsPage } from "./pages/ExerciseStatsPage";
import { StatsPage } from "./pages/StatsPage";
import { ExercisesPage } from "./pages/ExercisesPage";
import { ImportPage } from "./pages/ImportPage";
import { LogPage } from "./pages/LogPage";
import { LoginPage } from "./pages/LoginPage";
import { PickPage } from "./pages/PickPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WorkoutPage } from "./pages/WorkoutPage";
import { TimerProvider } from "./timer";
import { useSession } from "./session";
import { SyncProvider, useSync } from "./sync";

export function App() {
  const session = useSession();

  if (session.loading || !session.player) {
    return (
      <LanguageProvider language={browserLanguage()}>{session.loading ? <Loading /> : <LoginPage />}</LanguageProvider>
    );
  }
  return (
    <SyncProvider>
      <MeProvider fallback={(s) => <NotReady status={s} />}>
        <ExercisesProvider>
          <HistoryProvider>
            <TimerProvider>
              <Shell />
            </TimerProvider>
          </HistoryProvider>
        </ExercisesProvider>
      </MeProvider>
    </SyncProvider>
  );
}

function Loading() {
  return <div className="center-screen muted">{useT()("loading")}</div>;
}

function NotReady({ status }: { status: MeStatus }) {
  const t = useT();
  const { logoutAndForget: logout } = useSync();
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
  { to: "/", icon: "🏋️", label: "tabWorkout" },
  { to: "/exercises", icon: "📋", label: "tabExercises" },
  { to: "/stats", icon: "📈", label: "tabStats" },
] as const;

function Shell() {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <div className="app">
      <main className="main">
        <SyncBar />
        <Routes>
          <Route path="/" element={<WorkoutPage />} />
          <Route path="/pick" element={<PickPage />} />
          <Route path="/log/:exerciseId" element={<LogPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/stats/:exerciseId" element={<ExerciseStatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<div className="center-screen muted">{t("pageNotFound")}</div>} />
        </Routes>
      </main>
      <TimerBar />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to !== "/stats"}
            // Picking and logging an exercise belong to the Workout tab.
            className={({ isActive }) =>
              isActive || (tab.to === "/" && /^\/(pick|log)\b/.test(pathname)) ? "active" : ""
            }
          >
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
