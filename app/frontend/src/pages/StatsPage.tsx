import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Calendar } from "../components/Calendar";
import { Bars, Columns, Tile } from "../components/charts";
import { addDays, formatDay, todayIso } from "../dates";
import { useExercises } from "../exercises";
import { exerciseName, formatCount, formatNumber, formatSet, formatTonnage } from "../format";
import { useHistory } from "../history";
import { useLanguage, useT } from "../i18n";
import { recentPrs, volumeByPart, weekStart, weekStreaks, workoutDays, workoutsPerWeek, tonnage } from "../stats";

export function StatsPage() {
  const t = useT();
  const lang = useLanguage();
  const { sets, error } = useHistory();
  const { byId, categories } = useExercises();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const today = todayIso();

  const s = useMemo(() => {
    if (!sets) return undefined;
    const days = workoutDays(sets);
    const thisWeek = weekStart(today);
    const lastWeek = addDays(thisWeek, -7);
    const inRange = (from: string, to: string) => sets.filter((x) => x.date >= from && x.date <= to);
    const now = inRange(thisWeek, today);
    // Same days of last week, so Monday isn't compared with a whole week.
    const before = inRange(lastWeek, addDays(today, -7));
    const lastExercise = new Map<string, string>();
    for (const x of sets) lastExercise.set(x.exercise_id, x.date);
    return {
      days,
      streak: weekStreaks(days, today),
      workoutsNow: new Set(now.map((x) => x.date)).size,
      workoutsBefore: new Set(before.map((x) => x.date)).size,
      setsNow: now.length,
      setsBefore: before.length,
      kgNow: now.reduce((a, x) => a + tonnage(x), 0),
      kgBefore: before.reduce((a, x) => a + tonnage(x), 0),
      totalKg: sets.reduce((a, x) => a + tonnage(x), 0),
      weeks: workoutsPerWeek(days, today, 12),
      prs: recentPrs(sets, byId, addDays(today, -30)),
      exercises: [...lastExercise].sort((a, b) => (a[1] < b[1] ? 1 : -1)),
    };
  }, [sets, byId, today]);

  const parts = useMemo(() => {
    if (!sets) return [];
    const from = period === "week" ? weekStart(today) : `${today.slice(0, 8)}01`;
    const v = volumeByPart(sets, byId, from, today);
    return categories
      .map((c) => ({ c, v: v.get(c.id) }))
      .filter((x) => x.v)
      .sort((a, b) => b.v!.sets - a.v!.sets)
      .map(({ c, v }) => ({
        key: c.id,
        label: lang === "pl" ? c.pl : c.en,
        value: v!.sets,
        text: `${t("setsN", { n: String(v!.sets) })}${v!.tonnage ? ` · ${formatTonnage(v!.tonnage, lang)}` : ""}`,
        className: `cat-${c.id}`,
      }));
  }, [sets, byId, categories, period, today, lang, t]);

  const delta = (now: number, before: number, fmt: (n: number) => string) => {
    const d = now - before;
    if (!before && !now) return undefined;
    return t("vsLastWeek", { d: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))}` });
  };

  return (
    <section className="page stats">
      <h1>{t("tabStats")}</h1>
      {error && <p className="error">{error}</p>}
      {!s && !error && <p className="muted">{t("statsLoading")}</p>}
      {s && s.days.length === 0 && <p className="muted empty">{t("statsEmpty")}</p>}
      {s && s.days.length > 0 && (
        <>
          <h2>{t("thisWeek")}</h2>
          <div className="tiles">
            <Tile label={t("workouts")} value={s.workoutsNow} note={delta(s.workoutsNow, s.workoutsBefore, String)} />
            <Tile
              label={t("weekStreak")}
              value={t("weeksN", { n: String(s.streak.current) })}
              note={t("longestN", { n: String(s.streak.longest) })}
            />
            <Tile label={t("setsThisWeek")} value={s.setsNow} note={delta(s.setsNow, s.setsBefore, String)} />
            <Tile
              label={t("liftedThisWeek")}
              value={formatTonnage(s.kgNow, lang)}
              note={delta(s.kgNow, s.kgBefore, (n) => formatTonnage(n, lang))}
            />
          </div>

          <h2>🏆 {t("recentPrs")}</h2>
          {s.prs.length === 0 ? (
            <p className="muted">{t("noRecentPrs")}</p>
          ) : (
            <ul className="card list prs">
              {s.prs.slice(0, 8).map(({ set, previous }) => {
                const ex = byId.get(set.exercise_id);
                return (
                  <li key={set.id}>
                    <Link to={`/stats/${set.exercise_id}`} className={`pr-row cat-${ex?.category}`}>
                      <span className="cat-dot" aria-hidden />
                      <span className="pr-main">
                        <strong>{exerciseName(ex, lang)}</strong>
                        <span className="muted small">
                          {formatDay(set.date, lang)} ·{" "}
                          {previous === undefined
                            ? t("firstTime")
                            : t("beat", { w: `${formatNumber(previous, lang)} kg` })}
                        </span>
                      </span>
                      <span className="pr-set">{formatSet(set, ex, lang)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="section-head">
            <h2>{t("bodyParts")}</h2>
            <div className="segmented small-seg" role="radiogroup" aria-label={t("bodyParts")}>
              {(["week", "month"] as const).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={period === p}
                  className={period === p ? "on" : ""}
                  onClick={() => setPeriod(p)}
                >
                  {t(p)}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            {parts.length ? <Bars rows={parts} /> : <p className="muted small">{t("nothingInPeriod")}</p>}
          </div>

          <div className="section-head">
            <h2>{t("perWeek")}</h2>
            <span className="muted small">{t("last12Weeks")}</span>
          </div>
          <div className="card">
            <Columns
              color="var(--accent)"
              ariaLabel={`${t("perWeek")}: ${s.weeks.map((w) => w.workouts).join(", ")}`}
              items={s.weeks.map((w, i) => ({
                key: w.week,
                value: w.workouts,
                label: i % 3 === 0 || i === s.weeks.length - 1 ? formatDay(w.week, lang).replace(/^\S+\s/, "") : "",
                title: `${formatDay(w.week, lang)}: ${w.workouts}`,
              }))}
            />
          </div>

          <h2>{t("calendar")}</h2>
          <Calendar sets={sets!} />

          <h2>{t("allTime")}</h2>
          <div className="tiles">
            <Tile
              label={t("totalWorkouts")}
              value={formatCount(s.days.length, lang)}
              note={t("since", { date: formatDay(s.days[0], lang, true) })}
            />
            <Tile label={t("totalSets")} value={formatCount(sets!.length, lang)} />
            <Tile label={t("totalLifted")} value={formatTonnage(s.totalKg, lang)} />
          </div>

          <h2>{t("exerciseStats")}</h2>
          <ul className="card list">
            {s.exercises.map(([id, last]) => {
              const ex = byId.get(id);
              return (
                <li key={id} className="ex-row">
                  <Link className={`ex-name cat-${ex?.category}`} to={`/stats/${id}`}>
                    <span className="cat-dot" aria-hidden />
                    <span>{exerciseName(ex, lang)}</span>
                    <span className="muted small ml-auto">{t("lastDone", { date: formatDay(last, lang) })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
