import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "../api";
import { formatDay, todayIso } from "../dates";
import { useExercises } from "../exercises";
import { useHistory } from "../history";
import { exerciseName, formatDuration, formatNumber, formatSet, parseDuration, parseNumber } from "../format";
import { useLanguage, useT } from "../i18n";
import { isLift, prSetIds } from "../stats";
import { useTimer } from "../timer";
import type { Exercise, Session, WorkSet } from "../types";
import { DateBar, dayQuery, useDay } from "./WorkoutPage";

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Log one exercise on one day: kg and reps with big +/− buttons, like FitNotes. */
export function LogPage() {
  const t = useT();
  const { exerciseId = "" } = useParams();
  const { byId, loading } = useExercises();
  const ex = byId.get(exerciseId);
  if (loading) return <p className="page muted">{t("loading")}</p>;
  if (!ex) return <p className="page muted">{t("pageNotFound")}</p>;
  return <Logger key={ex.id} ex={ex} />;
}

function Logger({ ex }: { ex: Exercise }) {
  const t = useT();
  const lang = useLanguage();
  const api = useApi();
  const navigate = useNavigate();
  const timer = useTimer();
  const { update } = useExercises();
  const history = useHistory();
  const [day, setDay] = useDay();
  const [daySets, setDaySets] = useState<WorkSet[]>([]);
  const [last, setLast] = useState<Session | null>();
  const [selected, setSelected] = useState<string>();
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [distance, setDistance] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const cardio = ex.type === "cardio";
  const name = exerciseName(ex, lang);

  const sets = useMemo(() => daySets.filter((s) => s.exercise_id === ex.id), [daySets, ex.id]);
  const all = history.forExercise(ex.id);
  const prs = useMemo(() => (isLift(ex) ? prSetIds(all) : new Set<string>()), [all, ex]);

  function fill(s: WorkSet | undefined) {
    setWeight(s?.weight !== undefined ? formatNumber(s.weight, lang) : ex.type === "weight_reps" ? "" : "0");
    setReps(s?.reps !== undefined ? String(s.reps) : "");
    setDistance(s?.distance !== undefined ? formatNumber(s.distance, lang) : "");
    setTime(s?.seconds ? formatDuration(s.seconds) : "");
  }

  useEffect(() => {
    let stale = false;
    setSelected(undefined);
    setError(undefined);
    Promise.all([api.sets(day), api.history(ex.id, day, 1)])
      .then(([all, history]) => {
        if (stale) return;
        const mine = all.filter((s) => s.exercise_id === ex.id);
        setDaySets(all);
        setLast(history[0] ?? null);
        // Start from today's last set, else from last time's first set.
        fill(mine[mine.length - 1] ?? history[0]?.sets[0]);
      })
      .catch((e: Error) => !stale && setError(e.message));
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, day, ex.id]);

  function step(setter: (v: string) => void, value: string, delta: number, min: number) {
    const n = parseNumber(value) ?? 0;
    setter(formatNumber(Math.max(min, Math.round((n + delta) * 100) / 100), lang));
  }

  function build(): WorkSet | undefined {
    const base = sets.find((s) => s.id === selected);
    const set: WorkSet = {
      id: base?.id ?? newId(),
      date: day,
      exercise_id: ex.id,
      at: base?.at ?? new Date().toISOString(),
    };
    if (cardio) {
      const km = distance.trim() ? parseNumber(distance) : undefined;
      const secs = time.trim() ? parseDuration(time) : undefined;
      if ((distance.trim() && km === undefined) || (time.trim() && secs === undefined) || (!km && !secs)) {
        setError(t("invalidCardio"));
        return;
      }
      if (km) set.distance = km;
      if (secs) set.seconds = secs;
    } else {
      const w = parseNumber(weight || "0");
      const r = parseNumber(reps);
      if (w === undefined || r === undefined || r < 1 || !Number.isInteger(r)) {
        setError(t("invalidSet"));
        return;
      }
      set.weight = w;
      set.reps = r;
    }
    return set;
  }

  async function save() {
    const set = build();
    if (!set) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await api.saveSet(set);
      history.upsert(saved);
      setDaySets((all) =>
        all.some((s) => s.id === saved.id) ? all.map((s) => (s.id === saved.id ? saved : s)) : [...all, saved],
      );
      if (!selected && ex.rest > 0) timer.start(ex.rest, name);
      setSelected(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const set = sets.find((s) => s.id === selected);
    if (!set) return;
    setBusy(true);
    try {
      await api.deleteSet(set);
      history.remove(set.id);
      setDaySets((all) => all.filter((s) => s.id !== set.id));
      setSelected(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function select(s: WorkSet) {
    if (selected === s.id) {
      setSelected(undefined);
      return;
    }
    setSelected(s.id);
    fill(s);
  }

  return (
    <section className="page log">
      <button className="link back" onClick={() => navigate(`/${dayQuery(day)}`)}>
        ‹ {t("tabWorkout")}
      </button>
      <div className={`page-head cat-${ex.category}`}>
        <h1 className="ex-title">
          <span className="cat-dot" aria-hidden />
          {name}
        </h1>
        <button
          className={`icon-btn star${ex.favourite ? " on" : ""}`}
          aria-label={t("star")}
          aria-pressed={ex.favourite}
          onClick={() => update(ex.id, { favourite: !ex.favourite })}
        >
          {ex.favourite ? "★" : "☆"}
        </button>
      </div>
      {day !== todayIso() && <DateBar day={day} onChange={setDay} />}

      <div className="card entry">
        {cardio ? (
          <>
            <Field label={t("distanceKm")} value={distance} onChange={setDistance} mode="decimal" />
            <Field label={t("time")} value={time} onChange={setTime} mode="numeric" />
          </>
        ) : (
          <>
            <Stepper
              label={ex.type === "bodyweight_reps" ? t("addedKg") : t("weightKg")}
              value={weight}
              onChange={setWeight}
              onStep={(d) => step(setWeight, weight, d * ex.step, ex.type === "bodyweight_reps" ? -500 : 0)}
              mode="decimal"
            />
            <Stepper
              label={t("reps")}
              value={reps}
              onChange={setReps}
              onStep={(d) => step(setReps, reps, d, 1)}
              mode="numeric"
            />
          </>
        )}
        {error && <p className="error small">{error}</p>}
        <div className="entry-actions">
          <button className="btn primary big" onClick={save} disabled={busy}>
            {selected ? t("update") : t("save")}
          </button>
          {selected ? (
            <button className="btn danger big" onClick={remove} disabled={busy}>
              {t("delete")}
            </button>
          ) : (
            <button className="btn big" onClick={() => fill(undefined)} disabled={busy}>
              {t("clear")}
            </button>
          )}
        </div>
      </div>

      {sets.length > 0 && (
        <>
          <h2>{t("setsToday")}</h2>
          <ol className="card set-list big-list">
            {sets.map((s, i) => (
              <li key={s.id}>
                <button className={selected === s.id ? "selected" : ""} onClick={() => select(s)}>
                  <span className="set-no">{i + 1}</span>
                  {formatSet(s, ex, lang)}
                  {prs.has(s.id) && <span className="pr-badge">🏆 {t("pr")}</span>}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="section-head">
        <h2>{t("lastTime")}</h2>
        <Link className="link small" to={`/stats/${ex.id}`}>
          📈 {t("stats")} →
        </Link>
      </div>
      {last === undefined ? null : last ? (
        <div className="card">
          <p className="muted small history-date">{formatDay(last.date, lang, true)}</p>
          <ol className="set-list">
            {last.sets.map((s, i) => (
              <li key={s.id}>
                <span className="set-no">{i + 1}</span>
                {formatSet(s, ex, lang)}
                {prs.has(s.id) && <span className="pr-badge">{t("pr")}</span>}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="muted">{t("noHistory")}</p>
      )}

      <h2>{t("restTimer")}</h2>
      <div className="card prefs">
        <label>
          {t("rest")} ({t("seconds")})
          <input
            inputMode="numeric"
            defaultValue={ex.rest}
            onBlur={(e) => {
              const n = parseNumber(e.target.value);
              if (n !== undefined && Number.isInteger(n) && n >= 0 && n <= 3600 && n !== ex.rest)
                update(ex.id, { rest: n });
            }}
          />
        </label>
        {!cardio && (
          <label>
            {t("stepKg")}
            <input
              inputMode="decimal"
              defaultValue={formatNumber(ex.step, lang)}
              onBlur={(e) => {
                const n = parseNumber(e.target.value);
                if (n !== undefined && n >= 0.25 && n <= 50 && n !== ex.step) update(ex.id, { step: n });
              }}
            />
          </label>
        )}
      </div>
    </section>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; mode: "decimal" | "numeric" }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        className="big-input"
        inputMode={props.mode}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
    </label>
  );
}

function Stepper(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onStep: (direction: 1 | -1) => void;
  mode: "decimal" | "numeric";
}) {
  return (
    <div className="field">
      <span>{props.label}</span>
      <div className="stepper">
        <button type="button" className="step-btn" aria-label="−" onClick={() => props.onStep(-1)}>
          −
        </button>
        <input
          className="big-input"
          inputMode={props.mode}
          aria-label={props.label}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="step-btn" aria-label="+" onClick={() => props.onStep(1)}>
          +
        </button>
      </div>
    </div>
  );
}
