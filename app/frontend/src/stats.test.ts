import { describe, expect, it } from "vitest";
import {
  e1rm,
  prSetIds,
  recentPrs,
  repMaxes,
  sessions,
  volumeByPart,
  weekStart,
  weekStreaks,
  workoutsPerWeek,
} from "./stats";
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

const ex = (id: string, category: string, type: Exercise["type"] = "weight_reps") =>
  ({ id, category, type }) as Exercise;

describe("records", () => {
  it("estimates a 1RM", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 2);
    expect(e1rm(100, 20)).toBeUndefined();
    expect(e1rm(0, 5)).toBeUndefined();
  });

  it("marks a set as a PR when nothing earlier had as much weight and reps", () => {
    const a = set("2026-01-01", 60, 10); // first: PR
    const b = set("2026-01-01", 60, 10); // same again: no
    const c = set("2026-01-08", 60, 12); // more reps: PR
    const d = set("2026-01-08", 70, 5); // heavier: PR
    const e = set("2026-01-15", 65, 5); // beaten by 70×5: no
    const f = set("2026-01-15", 62.5, 11); // beaten by 60×12? no – heavier for 11 reps: PR
    expect([...prSetIds([f, e, d, c, b, a])].sort()).toEqual([a.id, c.id, d.id, f.id].sort());
  });

  it("lists rep maxes", () => {
    const sets = [set("2026-01-01", 100, 3), set("2026-01-02", 80, 10), set("2026-01-03", 90, 5)];
    const maxes = Object.fromEntries(repMaxes(sets).map((m) => [m.reps, m.weight]));
    expect(maxes).toEqual({ 1: 100, 2: 100, 3: 100, 4: 90, 5: 90, 6: 80, 8: 80, 10: 80 });
  });

  it("finds recent PRs with what they beat", () => {
    const byId = new Map([["bench", ex("bench", "chest")]]);
    const sets = [set("2026-01-01", 60, 10), set("2026-02-01", 65, 10), set("2026-02-02", 50, 10)];
    const prs = recentPrs(sets, byId, "2026-01-15");
    expect(prs.map((p) => [p.set.weight, p.previous])).toEqual([[65, 60]]);
  });
});

describe("sessions and volume", () => {
  it("adds up each day", () => {
    const [day] = sessions([set("2026-01-01", 60, 10), set("2026-01-01", 70, 5)]);
    expect(day.maxWeight).toBe(70);
    expect(day.volume).toBe(950);
    expect(day.reps).toBe(15);
    expect(day.e1rm).toBeCloseTo(81.67, 2);
  });

  it("works out cardio pace", () => {
    const run = { ...set("2026-01-01", 0, 0, "run"), weight: undefined, reps: undefined, distance: 5, seconds: 1500 };
    expect(sessions([run])[0].pace).toBe(5);
  });

  it("sums sets and kg per body part", () => {
    const byId = new Map([
      ["bench", ex("bench", "chest")],
      ["pullup", ex("pullup", "back", "bodyweight_reps")],
    ]);
    const sets = [set("2026-01-05", 60, 10), set("2026-01-06", 0, 8, "pullup"), set("2026-01-20", 60, 10)];
    const v = volumeByPart(sets, byId, "2026-01-05", "2026-01-11");
    expect(v.get("chest")).toEqual({ category: "chest", sets: 1, tonnage: 600 });
    expect(v.get("back")).toEqual({ category: "back", sets: 1, tonnage: 0 });
  });
});

describe("weeks", () => {
  it("starts weeks on Monday", () => {
    expect(weekStart("2026-10-29")).toBe("2026-10-26"); // Thursday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Sunday
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });

  it("counts week streaks; an empty current week doesn't break it yet", () => {
    const days = ["2026-10-01", "2026-10-06", "2026-10-14", "2026-10-21", "2026-09-01", "2026-09-08"];
    expect(weekStreaks(days, "2026-10-27")).toEqual({ current: 4, longest: 4 });
    expect(weekStreaks(days, "2026-11-04")).toEqual({ current: 0, longest: 4 });
  });

  it("counts workouts per week", () => {
    const weeks = workoutsPerWeek(["2026-10-19", "2026-10-21", "2026-10-28"], "2026-10-29", 3);
    expect(weeks).toEqual([
      { week: "2026-10-12", workouts: 0 },
      { week: "2026-10-19", workouts: 2 },
      { week: "2026-10-26", workouts: 1 },
    ]);
  });
});
