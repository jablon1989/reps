import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useApi } from "../api";
import { useExercises } from "../exercises";
import { exerciseName, formatNumber } from "../format";
import { useLanguage, useT } from "../i18n";
import { idbGet, idbSet } from "../idb";
import { useMe } from "../me";
import { parseFiveKey, unseenFives, type HighFive, type SharedPerson } from "../shared";
import { useSync } from "../sync";

/**
 * 🙌 on someone's PR or week: a button for the others' things (with how many
 * gave one), and who high-fived yours.
 */
export function FiveButton({
  person,
  fiveKey,
  myId,
  onToggle,
}: {
  person: SharedPerson;
  fiveKey: string;
  myId: string | undefined;
  onToggle: (person: SharedPerson, key: string, on: boolean) => void;
}) {
  const t = useT();
  const fives = person.fives.filter((f) => f.key === fiveKey);
  const names = fives.map((f) => f.from).join(", ");
  if (person.me) {
    if (!fives.length) return null;
    return (
      <span className="five got" title={t("fiveFrom", { names })}>
        🙌 {names}
      </span>
    );
  }
  const mine = fives.some((f) => f.from_id === myId);
  return (
    <button
      type="button"
      className={`five${mine ? " on" : ""}`}
      aria-pressed={mine}
      aria-label={t("fiveGive", { name: person.name })}
      title={names ? t("fiveFrom", { names }) : t("highFive")}
      onClick={() => onToggle(person, fiveKey, !mine)}
    >
      🙌{fives.length > 0 && <span className="five-n">{fives.length}</span>}
    </button>
  );
}

/** Words for a high-five you got: "Asiulka high-fived your Bench PR (100 kg × 3)". */
export function useFiveText(): (f: HighFive) => string {
  const t = useT();
  const lang = useLanguage();
  const { byId } = useExercises();
  return (f) => {
    const target = parseFiveKey(f.key);
    if (target?.kind === "pr") {
      return t("fiveNotePr", {
        name: f.from,
        exercise: exerciseName(byId.get(target.exercise_id), lang),
        set: `${formatNumber(target.weight, lang)} kg × ${target.reps}`,
      });
    }
    return t("fiveNoteWeek", { name: f.from });
  };
}

/**
 * When you open the app: who high-fived you since you last looked. Opening
 * the Us page (or OK) counts as seeing them.
 */
export function HighFiveNote() {
  const t = useT();
  const api = useApi();
  const sync = useSync();
  const { me } = useMe();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const text = useFiveText();
  const [fives, setFives] = useState<HighFive[]>([]);
  const key = sync.storeKey("fives-seen");
  const share = !!me.settings.share;

  useEffect(() => {
    if (!share) return;
    let stale = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      Promise.all([api.highFives(), idbGet<string>(key)])
        .then(([all, seen]) => !stale && setFives(unseenFives(all, seen)))
        .catch(() => undefined); // offline: next time
    };
    load();
    document.addEventListener("visibilitychange", load);
    return () => {
      stale = true;
      document.removeEventListener("visibilitychange", load);
    };
  }, [share, api, key]);

  const seen = fives[0]?.at;
  useEffect(() => {
    if (seen && pathname === "/stats/us") {
      idbSet(key, seen);
      setFives([]);
    }
  }, [seen, pathname, key]);

  if (!share || !fives.length) return null;
  const dismiss = () => {
    idbSet(key, fives[0].at);
    setFives([]);
  };
  return (
    <div className="sync-bar five-bar" role="status">
      <span>
        🙌 {text(fives[0])}
        {fives.length > 1 && <span className="five-more"> {t("fiveMore", { n: String(fives.length - 1) })}</span>}
      </span>
      <span className="five-actions">
        <button className="chip" onClick={() => navigate("/stats/us")}>
          {t("fiveSee")}
        </button>
        <button className="chip" onClick={dismiss}>
          {t("ok")}
        </button>
      </span>
    </div>
  );
}
