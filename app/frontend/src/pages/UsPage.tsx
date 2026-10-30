import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router";
import { errorText, useApi } from "../api";
import { CompareRows, GroupedColumns } from "../components/charts";
import { addDays, formatDay, todayIso } from "../dates";
import { useExercises } from "../exercises";
import { exerciseName, formatCount, formatNumber, formatTonnage } from "../format";
import { useHistory } from "../history";
import { useLanguage, useT, setsText } from "../i18n";
import { useMe } from "../me";
import { buildSummary, headToHead, type SharedPerson } from "../shared";
import { publish } from "../sharePublisher";
import { weekStart } from "../stats";
import { useSync } from "../sync";

/** You / Us switch at the top of both Stats pages. */
export function StatsSwitch() {
  const t = useT();
  return (
    <div className="page-head">
      <h1>{t("tabStats")}</h1>
      <nav className="segmented small-seg" aria-label={t("tabStats")}>
        <NavLink to="/stats" end className={({ isActive }) => (isActive ? "on" : "")}>
          {t("statsYou")}
        </NavLink>
        <NavLink to="/stats/us" className={({ isActive }) => (isActive ? "on" : "")}>
          {t("statsUs")}
        </NavLink>
      </nav>
    </div>
  );
}

const person = (i: number) => `person-${Math.min(i, 3)}`;

export function UsPage() {
  const t = useT();
  const { me, setShare } = useMe();
  return (
    <section className="page stats us">
      <StatsSwitch />
      {me.settings.share ? (
        <Shared />
      ) : (
        <div className="card share-intro">
          <p>{t("shareIntro")}</p>
          <button className="btn primary big" onClick={() => setShare(true)}>
            🤝 {t("shareStart")}
          </button>
        </div>
      )}
    </section>
  );
}

function Shared() {
  const t = useT();
  const lang = useLanguage();
  const api = useApi();
  const sync = useSync();
  const { sets } = useHistory();
  const { byId, categories, loading } = useExercises();
  const [people, setPeople] = useState<SharedPerson[]>();
  const [error, setError] = useState<string>();
  const [metric, setMetric] = useState<"workouts" | "tonnage">("workouts");
  const today = todayIso();
  const key = sync.storeKey("shared-sent");
  const ready = !!sets && !loading && sync.pending === 0;

  // Send yours first (if it changed), then load everyone's.
  useEffect(() => {
    if (!ready) return;
    let stale = false;
    publish(api, key, buildSummary(sets!, byId, todayIso()))
      .catch(() => undefined)
      .then(() => api.shared())
      .then((r) => !stale && (setPeople(r.people), setError(undefined)))
      .catch((err) => !stale && setError(errorText(err, t)));
    return () => {
      stale = true;
    };
    // Only on opening (and once the share setting has reached the server).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const names = useMemo(() => (people ?? []).map((p) => p.name), [people]);
  const h2h = useMemo(() => headToHead(people ?? []), [people]);
  const prs = useMemo(
    () =>
      (people ?? [])
        .flatMap((p, i) => p.prs.map((pr) => ({ ...pr, who: p.name, i })))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 12),
    [people],
  );

  if (error) return <p className="error">{error}</p>;
  if (!people) return <p className="muted">{t("usLoading")}</p>;

  const thisWeek = weekStart(today);
  const week = (p: SharedPerson) => p.weeks.find((w) => w.week === thisWeek);
  const kg = (n: number) => formatTonnage(n, lang);
  const legend = (
    <ul className="legend">
      {people.map((p, i) => (
        <li key={i} className={person(i)}>
          <span className="cat-dot" aria-hidden />
          {p.name}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {legend}
      {people.length < 2 && <p className="muted card">{t("usAlone")}</p>}

      <h2>{t("thisWeek")}</h2>
      <div className="card">
        <CompareRows
          names={names}
          seriesClass={person}
          rows={[
            {
              key: "workouts",
              label: t("workouts"),
              values: people.map((p) => week(p)?.workouts ?? 0),
              texts: people.map((p) => String(week(p)?.workouts ?? 0)),
            },
            {
              key: "sets",
              label: t("setsThisWeek"),
              values: people.map((p) => week(p)?.sets ?? 0),
              texts: people.map((p) => setsText(week(p)?.sets ?? 0, lang)),
            },
            {
              key: "kg",
              label: t("liftedThisWeek"),
              values: people.map((p) => week(p)?.tonnage ?? 0),
              texts: people.map((p) => kg(week(p)?.tonnage ?? 0)),
            },
            {
              key: "streak",
              label: t("weekStreak"),
              values: people.map((p) => p.streak),
              texts: people.map((p) => t("weeksN", { n: String(p.streak) })),
            },
          ]}
        />
      </div>

      <div className="section-head">
        <h2>{t("perWeek")}</h2>
        <div className="segmented small-seg" role="radiogroup" aria-label={t("perWeek")}>
          {(["workouts", "tonnage"] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={metric === m}
              className={metric === m ? "on" : ""}
              onClick={() => setMetric(m)}
            >
              {m === "workouts" ? t("workouts") : t("kgLifted")}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <GroupedColumns
          seriesClass={person}
          ariaLabel={`${t("perWeek")}, ${t("last12Weeks")}`}
          groups={(people[0]?.weeks ?? []).map((w, i, all) => ({
            key: w.week,
            label: i % 3 === 0 || i === all.length - 1 ? formatDay(w.week, lang).replace(/^\S+\s/, "") : "",
            title: `${formatDay(w.week, lang)}: ${people
              .map((p) => {
                const pw = p.weeks.find((x) => x.week === w.week);
                return `${p.name} ${metric === "workouts" ? (pw?.workouts ?? 0) : kg(pw?.tonnage ?? 0)}`;
              })
              .join(", ")}`,
            values: people.map((p) => {
              const pw = p.weeks.find((x) => x.week === w.week);
              return (metric === "workouts" ? pw?.workouts : pw?.tonnage) ?? 0;
            }),
          }))}
        />
        <p className="muted small">{t("last12Weeks")}</p>
      </div>

      {h2h.length > 0 && (
        <>
          <h2>⚔️ {t("headToHead")}</h2>
          <div className="card">
            <p className="muted small card-note">{t("headToHeadNote")}</p>
            <CompareRows
              names={names}
              seriesClass={person}
              rows={h2h.slice(0, 15).map((r) => ({
                key: r.exercise_id,
                className: `cat-${r.category}`,
                label: (
                  <span className="compare-name">
                    <span className="cat-dot" aria-hidden />
                    {exerciseName(byId.get(r.exercise_id) ?? r, lang)}
                  </span>
                ),
                values: r.bests.map((b) => b?.e1rm),
                texts: r.bests.map((b) =>
                  b ? `${formatNumber(Math.round(b.e1rm * 2) / 2, lang)} kg · ${formatNumber(b.weight, lang)} kg` : "–",
                ),
              }))}
            />
          </div>
        </>
      )}

      <h2>🏆 {t("recentPrs")}</h2>
      {prs.length === 0 ? (
        <p className="muted">{t("noRecentPrs")}</p>
      ) : (
        <ul className="card list prs">
          {prs.map((pr, n) => (
            <li key={n} className={`pr-row cat-${pr.category}`}>
              <span className="cat-dot" aria-hidden />
              <span className="pr-main">
                <strong>{exerciseName(byId.get(pr.exercise_id) ?? pr, lang)}</strong>
                <span className="muted small">
                  <span className={`who ${person(pr.i)}`} aria-hidden />
                  {t("prBy", { name: pr.who, date: formatDay(pr.date, lang) })}
                </span>
              </span>
              <span className="pr-set">
                {formatNumber(pr.weight, lang)} kg × {pr.reps}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2>{t("bodyPartsMonth")}</h2>
      <div className="card">
        <CompareRows
          names={names}
          seriesClass={person}
          rows={categories
            .filter((c) => people.some((p) => p.parts.some((x) => x.category === c.id)))
            .map((c) => {
              const part = (p: SharedPerson) => p.parts.find((x) => x.category === c.id);
              return {
                key: c.id,
                className: `cat-${c.id}`,
                label: (
                  <span className="compare-name">
                    <span className="cat-dot" aria-hidden />
                    {lang === "pl" ? c.pl : c.en}
                  </span>
                ),
                values: people.map((p) => part(p)?.sets ?? 0),
                texts: people.map((p) => setsText(part(p)?.sets ?? 0, lang)),
              };
            })}
        />
      </div>

      <h2>{t("allTime")}</h2>
      <div className="card">
        <CompareRows
          names={names}
          seriesClass={person}
          rows={[
            {
              key: "workouts",
              label: t("totalWorkouts"),
              values: people.map((p) => p.workouts),
              texts: people.map((p) => formatCount(p.workouts, lang)),
            },
            {
              key: "kg",
              label: t("totalLifted"),
              values: people.map((p) => p.tonnage),
              texts: people.map((p) => kg(p.tonnage)),
            },
            {
              key: "longest",
              label: t("longestStreak"),
              values: people.map((p) => p.longest),
              texts: people.map((p) => t("weeksN", { n: String(p.longest) })),
            },
          ]}
        />
        <p className="muted small">
          {people
            .filter((p) => p.first)
            .map((p) => `${p.name} ${t("since", { date: formatDay(p.first!, lang, true) })}`)
            .join(" · ")}
        </p>
      </div>

      <p className="muted small updated">
        {people.map((p) => (
          <span key={p.name}>
            {t("usUpdated", { name: p.name, when: updated(p.updated_at, lang, today) })}
            <br />
          </span>
        ))}
      </p>
    </>
  );
}

function updated(at: string, lang: "en" | "pl", today: string): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(lang === "pl" ? "pl-PL" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = todayIso(d);
  if (day === today) return time;
  if (day === addDays(today, -1)) return `${formatDay(day, lang)} ${time}`;
  return formatDay(day, lang, true);
}
