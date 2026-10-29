import { useT } from "../i18n";
import { useSession } from "../session";

export function LoginPage() {
  const t = useT();
  const { login, error, devPlayers } = useSession();

  return (
    <div className="login">
      <div className="login-card">
        <img src="/favicon.svg" alt="" width={72} height={72} />
        <h1 className="brand">reps</h1>
        <p className="muted">{t("tagline")}</p>
        {devPlayers ? (
          <>
            <p className="small muted">{t("devWho")}</p>
            <div className="stack">
              {devPlayers.map((p) => (
                <button key={p} className="btn primary big" onClick={() => login(p)}>
                  {t("devAs", { name: p })}
                </button>
              ))}
            </div>
          </>
        ) : (
          <button className="btn primary big" onClick={() => login()}>
            {t("logIn")}
          </button>
        )}
        {error && <p className="error small">{error}</p>}
      </div>
    </div>
  );
}
