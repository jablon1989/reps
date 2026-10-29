import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";
import { useApi } from "../api";
import { formatDay } from "../dates";
import { useExercises } from "../exercises";
import { exerciseName } from "../format";
import { useLanguage, useT } from "../i18n";
import type { ImportPreview, ImportResult } from "../types";

const MAX_BYTES = 4 * 1024 * 1024; // the API takes ~6 MB, base64 adds a third
const CHUNK = 1000;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type Step =
  | { kind: "pick"; error?: string }
  | { kind: "reading" }
  | { kind: "preview"; preview: ImportPreview; categories: Record<string, string>; error?: string }
  | { kind: "importing"; done: number; total: number }
  | { kind: "done"; result: ImportResult };

export function ImportPage() {
  const t = useT();
  const lang = useLanguage();
  const api = useApi();
  const navigate = useNavigate();
  const { categories, byId, reload } = useExercises();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [undoMessage, setUndoMessage] = useState<string>();
  const fmt = (n: number) => n.toLocaleString(lang === "pl" ? "pl-PL" : "en-GB");

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setStep({ kind: "pick", error: t("importTooBig") });
      return;
    }
    setStep({ kind: "reading" });
    try {
      const preview = await api.importParse(file.name, await readBase64(file));
      const chosen = Object.fromEntries(preview.exercises.map((x) => [x.name, x.category]));
      setStep({ kind: "preview", preview, categories: chosen });
    } catch (err) {
      setStep({ kind: "pick", error: (err as Error).message });
    }
  }

  async function run(preview: ImportPreview, chosen: Record<string, string>) {
    const total = preview.sets.length;
    setStep({ kind: "importing", done: 0, total });
    try {
      const ids = await api.importExercises(preview.exercises.map((x) => ({ ...x, category: chosen[x.name] })));
      const result: ImportResult = { saved: 0, skipped: [], skipped_count: 0 };
      for (let start = 0; start < total; start += CHUNK) {
        const chunk = preview.sets.slice(start, start + CHUNK).map((s) => ({ ...s, exercise_id: ids[s.exercise] }));
        const r = await api.importSets(chunk);
        result.saved += r.saved;
        result.skipped_count += r.skipped_count;
        result.skipped.push(...r.skipped.slice(0, 20 - result.skipped.length));
        setStep({ kind: "importing", done: Math.min(total, start + CHUNK), total });
      }
      await reload();
      setStep({ kind: "done", result });
    } catch (err) {
      setStep({ kind: "preview", preview, categories: chosen, error: (err as Error).message });
    }
  }

  async function undo() {
    if (!window.confirm(t("importUndoConfirm"))) return;
    try {
      const { deleted } = await api.importUndo();
      setUndoMessage(t("importUndone", { n: fmt(deleted) }));
    } catch (err) {
      setUndoMessage((err as Error).message);
    }
  }

  return (
    <section className="page">
      <button className="link back" onClick={() => navigate("/settings")}>
        ‹ {t("tabSettings")}
      </button>
      <h1>{t("importTitle")}</h1>

      {(step.kind === "pick" || step.kind === "reading") && (
        <div className="card stack">
          <p className="muted">{t("importIntro")}</p>
          <label className={`btn primary big file-btn${step.kind === "reading" ? " disabled" : ""}`}>
            {step.kind === "reading" ? t("importReading") : t("importPick")}
            <input type="file" accept=".fitnotes,.csv,.txt" onChange={pick} disabled={step.kind === "reading"} />
          </label>
          {step.kind === "pick" && step.error && <p className="error small">{step.error}</p>}
        </div>
      )}

      {step.kind === "preview" &&
        renderPreview({
          step,
          onCategory: (name, category) => setStep({ ...step, categories: { ...step.categories, [name]: category } }),
          onImport: () => run(step.preview, step.categories),
          onCancel: () => setStep({ kind: "pick" }),
        })}

      {step.kind === "importing" && (
        <div className="card stack">
          <p>{t("importProgress", { done: fmt(step.done), total: fmt(step.total) })}</p>
          <div className="progress">
            <div style={{ width: `${(100 * step.done) / Math.max(1, step.total)}%` }} />
          </div>
        </div>
      )}

      {step.kind === "done" && (
        <div className="card stack">
          <p className="ok">✓ {t("importDone", { saved: fmt(step.result.saved) })}</p>
          {step.result.skipped_count > 0 && (
            <>
              <p className="muted small">{t("importSkipped", { n: fmt(step.result.skipped_count) })}</p>
              <ul className="small muted skipped">
                {step.result.skipped.map((s, i) => (
                  <li key={i}>
                    {s.date} · {exerciseName(byId.get(s.exercise_id), lang)} – {s.why}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className="btn primary" onClick={() => navigate("/")}>
            {t("tabWorkout")} →
          </button>
        </div>
      )}

      <h2>{t("importUndo")}</h2>
      <div className="card stack">
        <p className="muted small">{t("importAgain")}</p>
        <button className="btn danger" onClick={undo} disabled={step.kind === "importing"}>
          {t("importUndo")}
        </button>
        {undoMessage && <p className="small">{undoMessage}</p>}
      </div>
    </section>
  );

  // A plain function (no hooks), so the dropdowns aren't rebuilt on every change.
  function renderPreview(props: {
    step: Extract<Step, { kind: "preview" }>;
    onCategory: (name: string, category: string) => void;
    onImport: () => void;
    onCancel: () => void;
  }) {
    const { preview, categories: chosen, error } = props.step;
    const matched = preview.exercises.filter((x) => x.builtin);
    const fresh = preview.exercises.filter((x) => !x.builtin);
    return (
      <div className="stack">
        <div className="card">
          <p className="big-number">{fmt(preview.sets.length)}</p>
          <p className="muted">
            {t("importSummary", {
              sets: fmt(preview.sets.length),
              days: fmt(preview.days),
              first: formatDay(preview.first, lang, true),
              last: formatDay(preview.last, lang, true),
            })}
          </p>
          <p className="ok small">✓ {t("importMatched", { n: String(matched.length) })}</p>
        </div>
        {fresh.length > 0 && (
          <>
            <h2>{t("importNew")}</h2>
            <ul className="card list">
              {fresh.map((x) => (
                <li key={x.name} className="import-row">
                  <span>
                    <strong>{x.name}</strong>
                    <span className="muted small">
                      {" "}
                      · {x.sets} {t("sets")}
                      {x.source_category && ` · ${x.source_category}`}
                    </span>
                    {x.check_category && <span className="pill">{t("importCheck")}</span>}
                  </span>
                  <select
                    value={chosen[x.name]}
                    aria-label={`${t("bodyPart")}: ${x.name}`}
                    onChange={(e) => props.onCategory(x.name, e.target.value)}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {lang === "pl" ? c.pl : c.en}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </>
        )}
        {error && <p className="error small">{error}</p>}
        <div className="entry-actions">
          <button className="btn primary big" onClick={props.onImport}>
            {t("importGo", { sets: fmt(preview.sets.length) })}
          </button>
          <button className="btn big" onClick={props.onCancel}>
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }
}
