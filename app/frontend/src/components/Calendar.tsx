import { useMemo, useState } from "react";
import { Link } from "react-router";
import { addDays, todayIso } from "../dates";
import { useExercises } from "../exercises";
import { useLanguage, useT } from "../i18n";
import type { WorkSet } from "../types";
import { dayQuery } from "../pages/WorkoutPage";

/** A month of training days; dots = body parts done that day. Tap a day to open it. */
export function Calendar({ sets }: { sets: WorkSet[] }) {
  const t = useT();
  const lang = useLanguage();
  const { byId, categories } = useExercises();
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7)); // YYYY-MM

  const partsByDay = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of sets) {
      if (!s.date.startsWith(month)) continue;
      const c = byId.get(s.exercise_id)?.category;
      if (!c) continue;
      const parts = map.get(s.date) ?? new Set<string>();
      parts.add(c);
      map.set(s.date, parts);
    }
    return map;
  }, [sets, byId, month]);

  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00`).getDay() + 6) % 7; // Monday first
  const days: string[] = [];
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  const order = categories.map((c) => c.id);
  const locale = lang === "pl" ? "pl-PL" : "en-GB";
  const title = new Date(`${first}T12:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdays = Array.from(
    { length: 7 },
    (_, i) => new Date(`${addDays("2026-10-26", i)}T12:00:00`).toLocaleDateString(locale, { weekday: "narrow" }), // a Monday
  );
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00`);
    d.setMonth(d.getMonth() + n);
    setMonth(todayIso(d).slice(0, 7));
  };
  const used = order.filter((c) => [...partsByDay.values()].some((p) => p.has(c)));

  return (
    <div className="card calendar">
      <div className="cal-head">
        <button className="icon-btn" aria-label={t("prevMonth")} onClick={() => shift(-1)}>
          ‹
        </button>
        <strong>{title}</strong>
        <button
          className="icon-btn"
          aria-label={t("nextMonth")}
          onClick={() => shift(1)}
          disabled={month >= today.slice(0, 7)}
        >
          ›
        </button>
      </div>
      <div className="cal-grid">
        {weekdays.map((w, i) => (
          <span key={i} className="cal-wd muted small">
            {w}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad${i}`} />
        ))}
        {days.map((d) => {
          const parts = partsByDay.get(d);
          const label = String(Number(d.slice(8)));
          const cls = `cal-day${parts ? " trained" : ""}${d === today ? " today" : ""}`;
          const dots = parts && (
            <span className="cal-dots" aria-hidden>
              {order
                .filter((c) => parts.has(c))
                .slice(0, 4)
                .map((c) => (
                  <span key={c} className={`cat-dot cat-${c}`} />
                ))}
            </span>
          );
          return parts ? (
            <Link key={d} to={`/${dayQuery(d)}`} className={cls} aria-label={d}>
              {label}
              {dots}
            </Link>
          ) : (
            <span key={d} className={cls}>
              {label}
            </span>
          );
        })}
      </div>
      {used.length > 0 && (
        <ul className="legend">
          {used.map((c) => {
            const cat = categories.find((x) => x.id === c)!;
            return (
              <li key={c}>
                <span className={`cat-dot cat-${c}`} aria-hidden />
                {lang === "pl" ? cat.pl : cat.en}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
