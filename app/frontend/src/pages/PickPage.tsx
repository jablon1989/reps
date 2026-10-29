import { useNavigate } from "react-router";
import { ExerciseList } from "../components/ExerciseList";
import { useT } from "../i18n";
import { dayQuery, useDay } from "./WorkoutPage";

export function PickPage() {
  const t = useT();
  const navigate = useNavigate();
  const [day] = useDay();
  return (
    <section className="page">
      <button className="link back" onClick={() => navigate(-1)}>
        ‹ {t("tabWorkout")}
      </button>
      <h1>{t("pickExercise")}</h1>
      <ExerciseList onPick={(ex) => navigate(`/log/${ex.id}${dayQuery(day)}`, { replace: true })} />
    </section>
  );
}
