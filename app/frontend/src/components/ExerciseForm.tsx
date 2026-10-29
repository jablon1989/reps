import { useState, type FormEvent } from "react";
import { useExercises } from "../exercises";
import { useLanguage, useT } from "../i18n";
import type { Exercise, ExerciseType } from "../types";

const TYPES: { id: ExerciseType; label: "typeWeight" | "typeBodyweight" | "typeCardio" }[] = [
  { id: "weight_reps", label: "typeWeight" },
  { id: "bodyweight_reps", label: "typeBodyweight" },
  { id: "cardio", label: "typeCardio" },
];

/** New / edit your own exercise, pinned to a body part. */
export function ExerciseForm({ exercise, onClose }: { exercise?: Exercise; onClose: (saved?: Exercise) => void }) {
  const t = useT();
  const lang = useLanguage();
  const { categories, create, update, remove } = useExercises();
  const [en, setEn] = useState(exercise?.en ?? "");
  const [pl, setPl] = useState(exercise && exercise.pl !== exercise.en ? exercise.pl : "");
  const [category, setCategory] = useState(exercise?.category ?? "");
  const [type, setType] = useState<ExerciseType>(exercise?.type ?? "weight_reps");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const input = { en: en.trim(), pl: pl.trim(), category, type };
      onClose(exercise ? await update(exercise.id, input) : await create(input));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function del() {
    if (!exercise || !window.confirm(t("deleteExerciseConfirm"))) return;
    await remove(exercise.id);
    onClose();
  }

  return (
    <div className="sheet-backdrop" onClick={() => onClose()}>
      <form className="sheet form" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <h2>{exercise ? t("editExercise") : t("newExercise")}</h2>
        <label>
          {t("nameEn")}
          <input value={en} onChange={(e) => setEn(e.target.value)} maxLength={60} autoFocus={lang === "en"} />
        </label>
        <label>
          {t("namePl")}
          <input value={pl} onChange={(e) => setPl(e.target.value)} maxLength={60} autoFocus={lang === "pl"} />
        </label>
        <p className="muted small">{t("nameHint")}</p>
        <label>
          {t("bodyPart")}
          <select value={category} onChange={(e) => setCategory(e.target.value)} required>
            <option value="" disabled>
              –
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === "pl" ? c.pl : c.en}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("type")}
          <select value={type} onChange={(e) => setType(e.target.value as ExerciseType)}>
            {TYPES.map((x) => (
              <option key={x.id} value={x.id}>
                {t(x.label)}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="row end">
          {exercise && (
            <button type="button" className="btn danger" onClick={del}>
              {t("delete")}
            </button>
          )}
          <button type="button" className="btn" onClick={() => onClose()}>
            {t("cancel")}
          </button>
          <button className="btn primary" disabled={busy || !(en.trim() || pl.trim()) || !category}>
            {t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
