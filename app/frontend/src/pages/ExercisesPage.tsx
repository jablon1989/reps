import { useState } from "react";
import { useNavigate } from "react-router";
import { ExerciseForm } from "../components/ExerciseForm";
import { ExerciseList } from "../components/ExerciseList";
import { useExercises } from "../exercises";
import { useT } from "../i18n";
import type { Exercise } from "../types";

export function ExercisesPage() {
  const t = useT();
  const navigate = useNavigate();
  const { loading, error } = useExercises();
  const [editing, setEditing] = useState<Exercise | "new">();

  return (
    <section className="page">
      <div className="page-head">
        <h1>{t("tabExercises")}</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          + {t("newExercise")}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">{t("loading")}</p>
      ) : (
        <ExerciseList onPick={(ex) => navigate(`/log/${ex.id}`)} onEdit={setEditing} />
      )}
      {editing && (
        <ExerciseForm exercise={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />
      )}
    </section>
  );
}
