import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Calendar } from "../components/Calendar";
import { useDocs } from "../docs";
import { useHistory } from "../history";
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
  const history = useHistory();
  const [picking, setPicking] = useState(false);
  const today = todayIso();
  const label = day === today ? t("today") : day === addDays(today, -1) ? t("yesterday") : formatDay(day, lang);
  return (
    <>
      <div className="date-bar">
        <button className="icon-btn" aria-label={t("prevDay")} onClick={() => onChange(addDays(day, -1))}>
          ‹
        </button>
        <button className="date-label" onClick={() => setPicking(true)} aria-label={t("pickDay")}>
          <strong>
            {label} <span aria-hidden>📅</span>
          </strong>
          <span className="muted small">{day === today ? formatDay(day, lang, true) : t("pickDay")}</span>
        </button>
        <button
          className="icon-btn"
          aria-label={t("nextDay")}
          onClick={() => onChange(addDays(day, 1))}
          disabled={day >= today}
        >
          ›
        </button>
      </div>
      {day !== today && (
        <button className="link small to-today" onClick={() => onChange(today)}>
          {t("today")} →
        </button>
      )}
      {picking && (
        <div className="sheet-backdrop" onClick={() => setPicking(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <Calendar
              sets={history.sets ?? []}
              selected={day}
              onPick={(d) => {
                onChange(d);
                setPicking(false);
              }}
            />
            <div className="row end cal-actions">
              <button
                className="btn"
                onClick={() => {
                  onChange(today);
                  setPicking(false);
                }}
              >
                {t("today")}
              </button>
              <button className="btn" onClick={() => setPicking(false)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** The exercise's targets in the day's routine, e.g. "3 × 10" (if the routine set any). */
export function useTarget(day: string, exerciseId: string): string | undefined {
  const { get } = useDocs();
  const plan = get("plan", day);
  const item = plan && get("routine", plan.routine_id)?.exercises.find((e) => e.exercise_id === exerciseId);
  if (!item || (!item.sets && !item.reps)) return undefined;
  return `${item.sets ?? "?"} × ${item.reps ?? "?"}`;
}

/** One day: the exercises done, in order, with their sets; what's left of a started routine; a note. */
export function WorkoutPage() {
  const t = useT();
  const lang = useLanguage();
  const navigate = useNavigate();
  const { byId } = useExercises();
  const history = useHistory();
  const { docs, get, put, remove } = useDocs();
  const [day, setDay] = useDay();
  const sets = useMemo(() => history.sets?.filter((s) => s.date === day), [history.sets, day]);
  const error = sets ? undefined : history.error;
  const plan = get("plan", day);
  const routine = plan && get("routine", plan.routine_id);

  const groups: { exerciseId: string; sets: WorkSet[] }[] = [];
  for (const s of sets ?? []) {
    const g = groups.find((x) => x.exerciseId === s.exercise_id);
    if (g) g.sets.push(s);
    else groups.push({ exerciseId: s.exercise_id, sets: [s] });
  }
  const done = new Set(groups.map((g) => g.exerciseId));
  const toDo = (plan?.exercise_ids ?? []).filter((id) => !done.has(id));

  return (
    <section className="page">
      <h1>{t("tabWorkout")}</h1>
      <DateBar day={day} onChange={setDay} />
      {error && <p className="error">{error}</p>}
      {!sets && !error && <p className="muted">{t("loading")}</p>}
      {plan && (
        <div className="section-head plan-head">
          <span className="pill">{t("planOf", { name: routine?.name ?? "–" })}</span>
          <button className="link small" onClick={() => remove("plan", day)}>
            {t("dropPlan")}
          </button>
        </div>
      )}
      {sets && groups.length === 0 && !plan && <p className="muted empty">{t("emptyDay")}</p>}
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
                      {s.comment && <span className="muted small set-comment">💬 {s.comment}</span>}
                    </li>
                  ))}
                </ol>
              </Link>
            </li>
          );
        })}
      </ul>
      {toDo.length > 0 && (
        <>
          <h2>{t("toDo")}</h2>
          <ul className="day">
            {toDo.map((id) => (
              <ToDo key={id} day={day} exerciseId={id} />
            ))}
          </ul>
        </>
      )}
      <button className="btn primary big" onClick={() => navigate(`/pick${dayQuery(day)}`)}>
        + {t("addExercise")}
      </button>
      {!plan && groups.length === 0 && (
        <div className="start-routine">
          <h2>{t("startRoutine")}</h2>
          <div className="chips">
            {[...docs.routine]
              .sort((a, b) => a.name.localeCompare(b.name, lang))
              .map((r) => (
                <button
                  key={r.id}
                  className="chip big-chip"
                  onClick={() =>
                    put("plan", { id: day, routine_id: r.id, exercise_ids: r.exercises.map((e) => e.exercise_id) })
                  }
                >
                  ▶ {r.name}
                </button>
              ))}
            <Link className="chip big-chip" to="/routines">
              {docs.routine.length ? `✎ ${t("manageRoutines")}` : `+ ${t("newRoutine")}`}
            </Link>
          </div>
        </div>
      )}
      <DayNote key={day} day={day} />
    </section>
  );
}

function ToDo({ day, exerciseId }: { day: string; exerciseId: string }) {
  const lang = useLanguage();
  const { byId } = useExercises();
  const ex = byId.get(exerciseId);
  const target = useTarget(day, exerciseId);
  return (
    <li>
      <Link className={`card day-ex to-do cat-${ex?.category}`} to={`/log/${exerciseId}${dayQuery(day)}`}>
        <span className="day-ex-head">
          <span className="cat-dot" aria-hidden />
          <strong>{exerciseName(ex, lang)}</strong>
          <span className="muted small ml-auto">{target ?? ""}</span>
          <span className="chev" aria-hidden>
            ›
          </span>
        </span>
      </Link>
    </li>
  );
}

function DayNote({ day }: { day: string }) {
  const t = useT();
  const { get, put, remove } = useDocs();
  const saved = get("note", day)?.text ?? "";
  const [text, setText] = useState<string>();
  return (
    <div className="day-note">
      <h2>📝 {t("dayNote")}</h2>
      <textarea
        key={day}
        className="note-input"
        rows={2}
        maxLength={2000}
        placeholder={t("dayNotePlaceholder")}
        value={text ?? saved}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text === undefined) return;
          const clean = text.trim();
          if (clean && clean !== saved) put("note", { id: day, text: clean });
          else if (!clean && saved) remove("note", day);
          setText(undefined);
        }}
      />
    </div>
  );
}
