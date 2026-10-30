import { describe, expect, it } from "vitest";
import { buildSummary, headToHead, personColors, type SharedPerson } from "./shared";
import type { Exercise, WorkSet } from "./types";

let n = 0;
const set = (date: string, weight: number, reps: number, exercise_id = "bench"): WorkSet => ({
  id: `s${++n}`,
  date,
  at: `${date}T12:00:${String(n % 60).padStart(2, "0")}`,
  exercise_id,
  weight,
  reps,
});
const ex = (id: string, category: string, custom = false) =>
  ({ id, category, type: "weight_reps", en: id, pl: id, custom }) as Exercise;
const byId = new Map([ex("bench", "chest"), ex("squat", "legs"), ex("mine", "back", true)].map((e) => [e.id, e]));

describe("shared summary", () => {
  const today = "2026-10-30"; // Friday; week starts Mon 26th
  const sets = [
    set("2026-10-01", 100, 5),
    set("2026-10-27", 100, 3),
    set("2026-10-27", 110, 1),
    set("2026-10-29", 120, 5, "squat"),
    set("2026-10-29", 50, 10, "mine"),
  ];
  const s = buildSummary(sets, byId, today);

  it("adds up weeks and totals", () => {
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks[11]).toEqual({ week: "2026-10-26", workouts: 2, sets: 4, tonnage: 300 + 110 + 600 + 500 });
    expect(s.workouts).toBe(3);
    expect(s.sets).toBe(5);
    expect(s.first).toBe("2026-10-01");
    expect(s.streak).toBe(1);
  });

  it("keeps the best estimated 1RM per lift, most done first", () => {
    expect(s.bests[0]).toMatchObject({ exercise_id: "bench", weight: 110, e1rm: 116.67, date: "2026-10-01" });
    expect(s.parts.map((p) => p.category)).toEqual(["chest", "legs", "back"]);
    expect(s.prs.map((p) => p.exercise_id)).toContain("squat");
  });

  it("compares only built-in lifts two people have done", () => {
    const person = (name: string, bests: SharedPerson["bests"]) => ({ ...s, name, me: false, updated_at: "", bests });
    const other = buildSummary([set("2026-10-28", 90, 5), set("2026-10-28", 60, 8, "mine")], byId, today);
    const rows = headToHead([person("A", s.bests), person("B", other.bests)]);
    expect(rows.map((r) => r.exercise_id)).toEqual(["bench"]);
    expect(rows[0].bests.map((b) => b?.e1rm)).toEqual([116.67, 105]);
  });
});

describe("person colours", () => {
  const p = (name: string, color: SharedPerson["color"], me = false) => ({ name, color, me }) as SharedPerson;
  it("keeps picks, gives a clash the first free colour", () => {
    expect(personColors([p("A", "pink", true), p("B", "pink"), p("C", null)])).toEqual(["pink", "lime", "blue"]);
  });
  it("uses your choice from the phone straight away", () => {
    expect(personColors([p("A", "pink", true), p("B", "teal")], "teal")).toEqual(["teal", "lime"]);
  });
});
