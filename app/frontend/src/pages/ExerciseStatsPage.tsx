import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { LineChart, Tile } from "../components/charts";
import { addDays, formatDay, todayIso } from "../dates";
import { useExercises } from "../exercises";
import {
  exerciseName,
  formatCount,
  formatDuration,
  formatNumber,
  formatPace,
  formatSet,
  formatTonnage,
} from "../format";
import { useHistory } from "../history";
import { useLanguage, useT } from "../i18n";
import { isLift, prSetIds, repMaxes, sessions, type SessionStats } from "../stats";
import { dayQuery } from "./WorkoutPage";

type Metric = "e1rm" | "max" | "volume" | "reps" | "distance" | "time" | "pace";
type Period = "1m" | "3m" | "1y" | "all";

const LIFT_METRICS: Metric[] = ["e1rm", "max", "volume", "reps"];
const CARDIO_METRICS: Metric[] = ["distance", "time", "pace"];
const PERIOD_DAYS: Record<Period, number | undefined> = { "1m": 31, "3m": 92, "1y": 366, all: undefined };

export function ExerciseStatsPage() {
  const t = useT();
  const lang = useLanguage();
  const navigate = useNavigate();
  const { exerciseId = "" } = useParams();
  const { byId } = useExercises();
  const history = useHistory();
  const ex = byId.get(exerciseId);
  const lift = isLift(ex);
  const [picked, setMetric] = useState<Metric>();
  // The exercise list may still be loading on the first render: choose once we know the type.
  const metrics = lift ? LIFT_METRICS : CARDIO_METRICS;
  const metric = picked && metrics.includes(picked) ? picked : metrics[0];
  const [period, setPeriod] = useState<Period>("3m");
  const [shown, setShown] = useState(10);

  const sets = history.forExercise(exerciseId);
  const data = useMemo(() => {
    const days = sessions(sets);
    return {
      days,
      prs: lift ? prSetIds(sets) : new Set<string>(),
      maxes: lift ? repMaxes(sets) : [],
      bestE1rm: Math.max(0, ...days.map((d) => d.e1rm ?? 0)),
      heaviest: sets.reduce<(typeof sets)[number] | undefined>(
        (best, s) =>
          !best ||
          (s.weight ?? 0) > (best.weight ?? 0) ||
          ((s.weight ?? 0) === (best.weight ?? 0) && (s.reps ?? 0) > (best.reps ?? 0))
            ? s
            : best,
        undefined,
      ),
      bestVolume: Math.max(0, ...days.map((d) => d.volume)),
      longest: Math.max(0, ...days.map((d) => d.distance)),
      bestPace: Math.min(Infinity, ...days.map((d) => d.pace ?? Infinity)),
    };
  }, [sets, lift]);

  const value = (d: SessionStats): number | undefined =>
    ({
      e1rm: d.e1rm,
      max: d.maxWeight,
      volume: d.volume,
      reps: d.reps,
      distance: d.distance || undefined,
      time: d.seconds ? d.seconds / 60 : undefined,
      pace: d.pace,
    })[metric];
  const format = (v: number): string =>
    metric === "volume"
      ? formatTonnage(v, lang)
      : metric === "reps"
        ? formatNumber(Math.round(v), lang)
        : metric === "distance"
          ? `${formatNumber(Math.round(v * 10) / 10, lang)} km`
          : metric === "time"
            ? formatDuration(Math.round(v * 60))
            : metric === "pace"
              ? formatPace(v)
              : `${formatNumber(Math.round(v * 10) / 10, lang)} kg`;

  const since = PERIOD_DAYS[period] ? addDays(todayIso(), -PERIOD_DAYS[period]!) : "";
  const points = data.days
    .filter((d) => d.date >= since)
    .map((d) => ({ date: d.date, value: value(d) }))
    .filter((p): p is { date: string; value: number } => p.value !== undefined);
  const locale = lang === "pl" ? "pl-PL" : "en-GB";
  const metricLabel = (m: Metric) =>
    t(
      (
        {
          e1rm: "mE1rm",
          max: "mMax",
          volume: "mVolume",
          reps: "mReps",
          distance: "mDistance",
          time: "mTime",
          pace: "mPace",
        } as const
      )[m],
    );

  if (!ex) return <p className="page muted">{history.sets ? t("pageNotFound") : t("statsLoading")}</p>;
  const newest = [...data.days].reverse();

  return (
    <section className={`page stats cat-${ex.category}`}>
      <button className="link back" onClick={() => navigate(-1)}>
        ‹ {t("tabStats")}
      </button>
      <div className="page-head">
        <h1 className="ex-title">
          <span className="cat-dot" aria-hidden />
          {exerciseName(ex, lang)}
        </h1>
        <Link className="btn link-btn" to={`/log/${ex.id}`}>
          + {t("logSets")}
        </Link>
      </div>
      {!history.sets && <p className="muted">{t("statsLoading")}</p>}
      {history.sets && data.days.length === 0 && <p className="muted">{t("noHistory")}</p>}
      {data.days.length > 0 && (
        <>
          <div className="tiles">
            {lift ? (
              <>
                <Tile
                  label={t("bestE1rm")}
                  value={data.bestE1rm ? `${formatNumber(Math.round(data.bestE1rm * 10) / 10, lang)} kg` : "–"}
                />
                <Tile
                  label={t("heaviest")}
                  value={data.heaviest ? formatSet(data.heaviest, ex, lang) : "–"}
                  note={data.heaviest && formatDay(data.heaviest.date, lang, true)}
                />
                <Tile label={t("bestVolume")} value={formatTonnage(data.bestVolume, lang)} />
              </>
            ) : (
              <>
                <Tile label={t("longest")} value={`${formatNumber(Math.round(data.longest * 10) / 10, lang)} km`} />
                <Tile
                  label={t("fastest")}
                  value={Number.isFinite(data.bestPace) ? `${formatPace(data.bestPace)} ${t("minPerKm")}` : "–"}
                />
              </>
            )}
            <Tile
              label={t("sessionsN")}
              value={formatCount(data.days.length, lang)}
              note={`${formatCount(sets.length, lang)} ${t("sets")}`}
            />
          </div>

          <h2>{t("graph")}</h2>
          <div className="card">
            <div className="chips" role="radiogroup" aria-label={t("graph")}>
              {metrics.map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={metric === m}
                  className={`chip${metric === m ? " on" : ""}`}
                  onClick={() => setMetric(m)}
                >
                  {metricLabel(m)}
                </button>
              ))}
            </div>
            {points.length >= 2 ? (
              <LineChart
                points={points}
                color="var(--cat)"
                format={format}
                formatDate={(d) => formatDay(d, lang, true)}
                formatTick={(d) =>
                  new Date(`${d}T12:00:00`).toLocaleDateString(
                    locale,
                    period === "1m" || period === "3m"
                      ? { day: "numeric", month: "short" }
                      : { month: "short", year: "2-digit" },
                  )
                }
                label={`${metricLabel(metric)}: ${format(points[0].value)} → ${format(points[points.length - 1].value)}`}
              />
            ) : (
              <p className="muted small chart-empty">{t("notEnoughData")}</p>
            )}
            <div className="chips" role="radiogroup" aria-label="Period">
              {(["1m", "3m", "1y", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={period === p}
                  className={`chip${period === p ? " on" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  {t(({ "1m": "p1m", "3m": "p3m", "1y": "p1y", all: "pAll" } as const)[p])}
                </button>
              ))}
            </div>
          </div>

          {data.maxes.length > 0 && (
            <>
              <h2>🏆 {t("records")}</h2>
              <div className="card">
                <table className="records">
                  <thead>
                    <tr>
                      <th>{t("repsCol")}</th>
                      <th>{t("weightCol")}</th>
                      <th>{t("dateCol")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.maxes.map((m) => (
                      <tr key={m.reps}>
                        <td>{m.reps}</td>
                        <td>
                          <strong>{formatNumber(m.weight, lang)} kg</strong>
                          {(m.set.reps ?? 0) > m.reps && <span className="muted small"> × {m.set.reps}</span>}
                        </td>
                        <td>
                          <Link to={`/${dayQuery(m.set.date)}`}>{formatDay(m.set.date, lang, true)}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="muted small">{t("recordsNote")}</p>
              </div>
            </>
          )}

          <h2>{t("historyAll")}</h2>
          <ul className="sessions">
            {newest.slice(0, shown).map((d) => (
              <li key={d.date} className="card">
                <Link className="muted small history-date" to={`/log/${ex.id}${dayQuery(d.date)}`}>
                  {formatDay(d.date, lang, true)}
                </Link>
                <ol className="set-list">
                  {d.sets.map((s, i) => (
                    <li key={s.id}>
                      <span className="set-no">{i + 1}</span>
                      {formatSet(s, ex, lang)}
                      {data.prs.has(s.id) && <span className="pr-badge">{t("pr")}</span>}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          {newest.length > shown && (
            <button className="btn big" onClick={() => setShown(shown + 20)}>
              {t("showMore")}
            </button>
          )}
        </>
      )}
    </section>
  );
}
