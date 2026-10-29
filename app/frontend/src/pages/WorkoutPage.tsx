import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useApi } from "../api";
import { addDays, formatDay, todayIso } from "../dates";
import { useExercises } from "../exercises";
import { exerciseName, formatSet } from "../format";
import { useLanguage, useT } from "../i18n";
import type { WorkSet } from "../types";

export function useDay(): [string, (day: string) => void] {
  const [params, setParams] = useSearchParams();
  const day = params.get("date") || todayIso();
  return [day, (d) => setParams(d === todayIso() ? {} : { date: d }, { replace: true })];
}

export function dayQuery(day: string): string {
  return day === todayIso() ? "" : `?date=${day}`;
}

export function DateBar({ day, onChange }: { day: string; onChange: (day: string) => void }) {
  const t = useT();
  const lang = useLanguage();
  const today = todayIso();
  const label = day === today ? t("today") : day === addDays(today, -1) ? t("yesterday") : formatDay(day, lang);
  return (
    <div className="date-bar">
      <button className="icon-btn" aria-label={t("prevDay")} onClick={() => onChange(addDays(day, -1))}>
        ‹
      </button>
      <div className="date-label">
        <strong>{label}</strong>
        {day !== today && (
          <button className="link small" onClick={() => onChange(today)}>
            {t("today")} →
          </button>
        )}
        {day === today && <span className="muted small">{formatDay(day, lang, true)}</span>}
      </div>
      <button className="icon-btn" aria-label={t("nextDay")} onClick={() => onChange(addDays(day, 1))}>
        ›
      </button>
    </div>
  );
}

/** One day: the exercises done, in order, with their sets. */
export function WorkoutPage() {
  const t = useT();
  const lang = useLanguage();
  const api = useApi();
  const navigate = useNavigate();
  const { byId } = useExercises();
  const [day, setDay] = useDay();
  const [sets, setSets] = useState<WorkSet[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    setSets(undefined);
    setError(undefined);
    api
      .sets(day)
      .then(setSets)
      .catch((e: Error) => setError(e.message));
  }, [api, day]);

  const groups: { exerciseId: string; sets: WorkSet[] }[] = [];
  for (const s of sets ?? []) {
    const g = groups.find((x) => x.exerciseId === s.exercise_id);
    if (g) g.sets.push(s);
    else groups.push({ exerciseId: s.exercise_id, sets: [s] });
  }

  return (
    <section className="page">
      <h1>{t("tabWorkout")}</h1>
      <DateBar day={day} onChange={setDay} />
      {error && <p className="error">{error}</p>}
      {!sets && !error && <p className="muted">{t("loading")}</p>}
      {sets && groups.length === 0 && <p className="muted empty">{t("emptyDay")}</p>}
      <ul className="day">
        {groups.map((g) => {
          const ex = byId.get(g.exerciseId);
          return (
            <li key={g.exerciseId}>
              <Link className={`card day-ex cat-${ex?.category}`} to={`/log/${g.exerciseId}${dayQuery(day)}`}>
                <span className="day-ex-head">
                  <span className="cat-dot" aria-hidden />
                  <strong>{exerciseName(ex, lang)}</strong>
                </span>
                <ol className="set-list">
                  {g.sets.map((s, i) => (
                    <li key={s.id}>
                      <span className="set-no">{i + 1}</span>
                      {formatSet(s, ex, lang)}
                    </li>
                  ))}
                </ol>
              </Link>
            </li>
          );
        })}
      </ul>
      <button className="btn primary big" onClick={() => navigate(`/pick${dayQuery(day)}`)}>
        + {t("addExercise")}
      </button>
    </section>
  );
}
