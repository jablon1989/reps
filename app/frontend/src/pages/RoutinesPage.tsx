import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ExerciseList } from "../components/ExerciseList";
import { useDocs } from "../docs";
import { useExercises } from "../exercises";
import { exerciseName, parseNumber } from "../format";
import { useLanguage, useT } from "../i18n";
import type { Routine, RoutineItem } from "../types";
import { dayQuery } from "./WorkoutPage";

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Your saved plans. With ?start=<date>, tapping one starts it on that day. */
export function RoutinesPage() {
  const t = useT();
  const lang = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const startOn = params.get("start");
  const { docs, put } = useDocs();
  const { byId } = useExercises();
  const [editing, setEditing] = useState<Routine | "new">();
  const routines = [...docs.routine].sort((a, b) => a.name.localeCompare(b.name, lang));

  function start(r: Routine) {
    if (!startOn || !r.exercises.length) return;
    put("plan", { id: startOn, routine_id: r.id, exercise_ids: r.exercises.map((e) => e.exercise_id) });
    navigate(`/${dayQuery(startOn)}`);
  }

  return (
    <section className="page">
      <button className="link back" onClick={() => navigate(-1)}>
        ‹ {t("tabWorkout")}
      </button>
      <div className="page-head">
        <h1>{startOn ? t("startRoutine") : t("routines")}</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          + {t("newRoutine")}
        </button>
      </div>
      {routines.length === 0 && <p className="muted empty">{t("noRoutines")}</p>}
      <ul className="routines">
        {routines.map((r) => (
          <li key={r.id} className="card routine">
            <button className="routine-main" onClick={() => (startOn ? start(r) : setEditing(r))}>
              <strong>{r.name}</strong>
              <span className="muted small">
                {r.exercises.map((e) => exerciseName(byId.get(e.exercise_id), lang)).join(" · ")}
              </span>
            </button>
            {startOn ? (
              <button className="btn primary" onClick={() => start(r)} disabled={!r.exercises.length}>
                ▶
              </button>
            ) : (
              <button className="icon-btn" aria-label={t("editRoutine")} onClick={() => setEditing(r)}>
                ✎
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <RoutineEditor routine={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}

function RoutineEditor({ routine, onClose }: { routine?: Routine; onClose: () => void }) {
  const t = useT();
  const lang = useLanguage();
  const { put, remove } = useDocs();
  const { byId } = useExercises();
  const [name, setName] = useState(routine?.name ?? "");
  const [items, setItems] = useState<RoutineItem[]>(routine?.exercises ?? []);
  const [picking, setPicking] = useState(false);

  const change = (i: number, patch: Partial<RoutineItem>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const target = (text: string, max: number) => {
    const n = parseNumber(text);
    return n !== undefined && Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
  };

  function save() {
    put("routine", { id: routine?.id ?? newId(), name: name.trim(), exercises: items });
    onClose();
  }

  function del() {
    if (!routine || !window.confirm(t("deleteRoutineConfirm"))) return;
    remove("routine", routine.id);
    onClose();
  }

  if (picking) {
    return (
      <div className="sheet-backdrop" onClick={() => setPicking(false)}>
        <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
          <h2>{t("addToRoutine")}</h2>
          <ExerciseList
            onPick={(ex) => {
              setItems((list) => [...list, { exercise_id: ex.id }]);
              setPicking(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet form" onClick={(e) => e.stopPropagation()}>
        <h2>{routine ? t("editRoutine") : t("newRoutine")}</h2>
        <label>
          {t("routineName")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t("routineNamePlaceholder")}
            autoFocus={!routine}
          />
        </label>
        <ol className="routine-items">
          {items.map((it, i) => {
            const ex = byId.get(it.exercise_id);
            return (
              <li key={`${it.exercise_id}-${i}`} className={`cat-${ex?.category}`}>
                <div className="routine-item-head">
                  <span className="cat-dot" aria-hidden />
                  <strong>{exerciseName(ex, lang)}</strong>
                </div>
                <div className="routine-item-row">
                  {ex?.type !== "cardio" && (
                    <>
                      <label>
                        {t("targetSets")}
                        <input
                          inputMode="numeric"
                          defaultValue={it.sets ?? ""}
                          onBlur={(e) => change(i, { sets: target(e.target.value, 20) })}
                        />
                      </label>
                      <label>
                        {t("targetReps")}
                        <input
                          inputMode="numeric"
                          defaultValue={it.reps ?? ""}
                          onBlur={(e) => change(i, { reps: target(e.target.value, 100) })}
                        />
                      </label>
                    </>
                  )}
                  <span className="routine-item-actions">
                    <button
                      type="button"
                      className="chip"
                      aria-label={t("moveUp")}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="chip"
                      aria-label={t("moveDown")}
                      disabled={i === items.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="chip"
                      aria-label={t("removeFromRoutine")}
                      onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn" onClick={() => setPicking(true)}>
          + {t("addToRoutine")}
        </button>
        <div className="row end">
          {routine && (
            <button type="button" className="btn danger" onClick={del}>
              {t("delete")}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="btn primary" disabled={!name.trim() || !items.length} onClick={save}>
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
