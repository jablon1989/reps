import { useState } from "react";
import { formatDay } from "../dates";
import { useDocs } from "../docs";
import { formatNumber, parseNumber } from "../format";
import { useLanguage, useT } from "../i18n";
import { goalProgress } from "../stats";
import type { WorkSet } from "../types";

/** One exercise's goal (e.g. 100 kg × 1): progress so far, or a form to set it. */
export function GoalCard({ exerciseId, sets }: { exerciseId: string; sets: WorkSet[] }) {
  const t = useT();
  const lang = useLanguage();
  const { get, put, remove } = useDocs();
  const goal = get("goal", exerciseId);
  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("1");

  if (!goal && !editing) {
    return (
      <button className="btn" onClick={() => setEditing(true)}>
        🎯 {t("setGoal")}
      </button>
    );
  }

  if (editing) {
    const w = parseNumber(weight);
    const r = parseNumber(reps);
    const ok = w !== undefined && w >= 1 && w <= 1000 && r !== undefined && Number.isInteger(r) && r >= 1 && r <= 30;
    return (
      <div className="card goal-card">
        <div className="goal-inputs">
          <label>
            {t("weightKg")}
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
          </label>
          <span aria-hidden>×</span>
          <label>
            {t("reps")}
            <input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
          </label>
        </div>
        <div className="row end">
          {goal && (
            <button
              className="btn danger"
              onClick={() => {
                remove("goal", exerciseId);
                setEditing(false);
              }}
            >
              {t("goalRemove")}
            </button>
          )}
          <button className="btn" onClick={() => setEditing(false)}>
            {t("cancel")}
          </button>
          <button
            className="btn primary"
            disabled={!ok}
            onClick={() => {
              put("goal", { id: exerciseId, weight: w!, reps: r! });
              setEditing(false);
            }}
          >
            {t("save")}
          </button>
        </div>
      </div>
    );
  }

  const g = goal!;
  const p = goalProgress(sets, g.weight, g.reps ?? 1);
  const share = Math.min(1, (p.best ?? 0) / g.weight);
  return (
    <button
      className="card goal-card goal-view"
      onClick={() => {
        setWeight(formatNumber(g.weight, lang));
        setReps(String(g.reps ?? 1));
        setEditing(true);
      }}
    >
      <span className="section-head">
        <strong>🎯 {t("goalFor", { w: formatNumber(g.weight, lang), reps: String(g.reps ?? 1) })}</strong>
        <span className="muted small">{Math.round(share * 100)}%</span>
      </span>
      <span className="progress">
        <span style={{ width: `${share * 100}%` }} />
      </span>
      <span className="muted small">
        {p.achieved
          ? t("goalAchieved", { date: formatDay(p.achieved.date, lang, true) })
          : p.best !== undefined
            ? `${t("goalBest", { w: formatNumber(p.best, lang) })} · ${t("goalToGo", { d: formatNumber(Math.round((g.weight - p.best) * 100) / 100, lang) })}`
            : t("goalNone")}
      </span>
    </button>
  );
}
