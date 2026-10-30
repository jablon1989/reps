import { useMemo, useState } from "react";
import { LineChart } from "../components/charts";
import { addDays, formatDay, todayIso } from "../dates";
import { useDocs } from "../docs";
import { formatNumber, parseNumber } from "../format";
import { useLanguage, useT } from "../i18n";
import { BODY_FIELDS, type BodyEntry, type BodyField } from "../types";

const LIMITS: Record<BodyField, [number, number]> = {
  weight: [20, 400],
  bodyfat: [1, 80],
  waist: [30, 250],
  chest: [40, 250],
  arm: [10, 100],
  thigh: [20, 150],
  hips: [40, 250],
};
const UNIT: Record<BodyField, string> = {
  weight: "kg",
  bodyfat: "%",
  waist: "cm",
  chest: "cm",
  arm: "cm",
  thigh: "cm",
  hips: "cm",
};
type Period = "3m" | "1y" | "all";

/** Body weight and measurements: one entry per day, a chart, and a goal weight. */
export function BodyPage() {
  const t = useT();
  const lang = useLanguage();
  const { docs, put, remove, get } = useDocs();
  const today = todayIso();
  const [date, setDate] = useState(today);
  const entries = useMemo(() => [...docs.body].sort((a, b) => (a.date < b.date ? -1 : 1)), [docs.body]);
  const current = entries.find((e) => e.date === date);
  const [values, setValues] = useState<Partial<Record<BodyField, string>>>({});
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [field, setField] = useState<BodyField>("weight");
  const [period, setPeriod] = useState<Period>("3m");
  const goal = get("goal", "body-weight");
  const [goalText, setGoalText] = useState<string>();

  const shown = (f: BodyField) => values[f] ?? (current?.[f] !== undefined ? formatNumber(current[f]!, lang) : "");

  function edit(e: BodyEntry) {
    setDate(e.date);
    setValues({});
    setMore(BODY_FIELDS.some((f) => f !== "weight" && e[f] !== undefined));
    setSaved(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save() {
    const entry: BodyEntry = { id: date, date };
    for (const f of BODY_FIELDS) {
      const text = shown(f).trim();
      if (!text) continue;
      const n = parseNumber(text);
      const [lo, hi] = LIMITS[f];
      if (n === undefined || n < lo || n > hi) {
        setError(`${t(`f_${f}`)}: ${lo}–${hi}`);
        return;
      }
      entry[f] = n;
    }
    if (Object.keys(entry).length === 2) return;
    setError(undefined);
    put("body", entry);
    setValues({});
    setSaved(true);
  }

  const latestWeight = [...entries].reverse().find((e) => e.weight !== undefined)?.weight;
  const since = period === "3m" ? addDays(today, -92) : period === "1y" ? addDays(today, -366) : "";
  const points = entries
    .filter((e) => e.date >= since && e[field] !== undefined)
    .map((e) => ({ date: e.date, value: e[field]! }));
  const withData = BODY_FIELDS.filter((f) => entries.some((e) => e[f] !== undefined));

  return (
    <section className="page">
      <h1>{t("body")}</h1>

      <div className="card form body-form">
        <div className="section-head">
          <strong>{date === today ? t("bodyToday") : formatDay(date, lang, true)}</strong>
          {date !== today && (
            <button className="link small" onClick={() => edit({ id: today, date: today })}>
              {t("today")} →
            </button>
          )}
        </div>
        {BODY_FIELDS.filter((f) => f === "weight" || more).map((f) => (
          <label key={`${date}-${f}`}>
            {t(`f_${f}`)}
            <input
              className={f === "weight" ? "big-input" : undefined}
              inputMode="decimal"
              value={shown(f)}
              onChange={(e) => {
                setSaved(false);
                setValues((v) => ({ ...v, [f]: e.target.value }));
              }}
            />
          </label>
        ))}
        <button className="link small" onClick={() => setMore(!more)}>
          {more ? t("bodyLess") : t("bodyMore")}
        </button>
        {error && <p className="error small">{error}</p>}
        <div className="entry-actions">
          <button className="btn primary big" onClick={save}>
            {saved ? `✓ ${t("bodySaved")}` : t("save")}
          </button>
          {current && (
            <button
              className="btn danger big"
              onClick={() => {
                if (!window.confirm(t("deleteEntryConfirm"))) return;
                remove("body", current.id);
                setValues({});
              }}
            >
              {t("delete")}
            </button>
          )}
        </div>
      </div>

      <h2>{t("goal")}</h2>
      <div className="card goal-card">
        <label className="inline-field">
          {t("bodyGoal")}
          <input
            inputMode="decimal"
            value={goalText ?? (goal ? formatNumber(goal.weight, lang) : "")}
            onChange={(e) => setGoalText(e.target.value)}
            onBlur={() => {
              if (goalText === undefined) return;
              const n = parseNumber(goalText);
              if (!goalText.trim()) remove("goal", "body-weight");
              else if (n !== undefined && n >= 20 && n <= 400) put("goal", { id: "body-weight", weight: n });
              setGoalText(undefined);
            }}
          />
        </label>
        {goal && latestWeight !== undefined && (
          <p className="small">
            {Math.abs(latestWeight - goal.weight) < 0.05
              ? t("bodyGoalReached")
              : t("bodyGoalLeft", {
                  d: formatNumber(Math.round(Math.abs(latestWeight - goal.weight) * 10) / 10, lang),
                })}
          </p>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="muted empty">{t("bodyEmpty")}</p>
      ) : (
        <>
          <h2>{t("graph")}</h2>
          <div className="card">
            <div className="chips" role="radiogroup" aria-label={t("graph")}>
              {withData.map((f) => (
                <button
                  key={f}
                  role="radio"
                  aria-checked={field === f}
                  className={`chip${field === f ? " on" : ""}`}
                  onClick={() => setField(f)}
                >
                  {t(`s_${f}`)}
                </button>
              ))}
            </div>
            {points.length >= 2 ? (
              <LineChart
                points={points}
                color="var(--accent)"
                format={(v) => `${formatNumber(Math.round(v * 10) / 10, lang)} ${UNIT[field]}`}
                formatDate={(d) => formatDay(d, lang, true)}
                formatTick={(d) =>
                  new Date(`${d}T12:00:00`).toLocaleDateString(
                    lang === "pl" ? "pl-PL" : "en-GB",
                    period === "3m" ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" },
                  )
                }
                label={`${t(`s_${field}`)}: ${points.map((p) => p.value).join(", ")}`}
              />
            ) : (
              <p className="muted small chart-empty">{t("notEnoughData")}</p>
            )}
            <div className="chips" role="radiogroup" aria-label="Period">
              {(["3m", "1y", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={period === p}
                  className={`chip${period === p ? " on" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  {t(({ "3m": "p3m", "1y": "p1y", all: "pAll" } as const)[p])}
                </button>
              ))}
            </div>
          </div>

          <h2>{t("bodyHistory")}</h2>
          <ul className="card list body-history">
            {[...entries]
              .reverse()
              .slice(0, 60)
              .map((e) => (
                <li key={e.id}>
                  <button onClick={() => edit(e)}>
                    <span className="muted small">{formatDay(e.date, lang, true)}</span>
                    <span>
                      {BODY_FIELDS.filter((f) => e[f] !== undefined)
                        .map((f) => `${f === "weight" ? "" : `${t(`s_${f}`)} `}${formatNumber(e[f]!, lang)} ${UNIT[f]}`)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
