/** Records and stats, worked out from all your sets (pure functions, no React). */
import { addDays } from "./dates";
import type { Exercise, WorkSet } from "./types";

export const REP_MAX_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
const E1RM_MAX_REPS = 15;

export function isLift(ex: Exercise | undefined): boolean {
  return ex?.type === "weight_reps" || ex?.type === "bodyweight_reps";
}

/** Estimated one-rep max (Epley). Only up to 15 reps – beyond that it's guesswork. */
export function e1rm(weight: number, reps: number): number | undefined {
  if (weight <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return undefined;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** kg moved: weight × reps (added weight only for bodyweight exercises). */
export function tonnage(set: WorkSet): number {
  return Math.max(0, set.weight ?? 0) * (set.reps ?? 0);
}

export function byTime(a: WorkSet, b: WorkSet): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

/**
 * Sets that were a personal record when done: nothing before them had both
 * as much weight and as many reps. A heavier single and more reps at a
 * working weight both count; repeating a set doesn't.
 * `sets`: one exercise, any order.
 */
export function prSetIds(sets: WorkSet[]): Set<string> {
  const best: number[] = []; // best[r] = heaviest weight done for at least r reps
  const prs = new Set<string>();
  for (const s of [...sets].sort(byTime)) {
    const reps = Math.min(s.reps ?? 0, 200);
    const w = s.weight ?? 0;
    if (reps < 1) continue;
    const beaten = best[reps];
    if (beaten === undefined || w > beaten) prs.add(s.id);
    for (let r = 1; r <= reps; r++) if (best[r] === undefined || w > best[r]) best[r] = w;
  }
  return prs;
}

export interface RepMax {
  reps: number;
  weight: number;
  /** the set it came from (may have more reps than `reps`) */
  set: WorkSet;
}

/** Heaviest weight for at least N reps, for the usual N. First time wins ties. */
export function repMaxes(sets: WorkSet[]): RepMax[] {
  const out: RepMax[] = [];
  const sorted = [...sets].sort(byTime);
  for (const n of REP_MAX_COUNTS) {
    let best: WorkSet | undefined;
    for (const s of sorted) if ((s.reps ?? 0) >= n && (!best || (s.weight ?? 0) > (best.weight ?? 0))) best = s;
    if (best) out.push({ reps: n, weight: best.weight ?? 0, set: best });
  }
  return out;
}

export interface SessionStats {
  date: string;
  sets: WorkSet[];
  maxWeight: number;
  e1rm?: number;
  volume: number;
  reps: number;
  distance: number;
  seconds: number;
  /** min per km */
  pace?: number;
}

/** One exercise, per day, oldest first. */
export function sessions(sets: WorkSet[]): SessionStats[] {
  const days = new Map<string, WorkSet[]>();
  for (const s of [...sets].sort(byTime)) {
    const list = days.get(s.date);
    if (list) list.push(s);
    else days.set(s.date, [s]);
  }
  return [...days].map(([date, list]) => {
    let maxWeight = 0;
    let best: number | undefined;
    let volume = 0;
    let reps = 0;
    let distance = 0;
    let seconds = 0;
    for (const s of list) {
      maxWeight = Math.max(maxWeight, s.weight ?? 0);
      const e = e1rm(s.weight ?? 0, s.reps ?? 0);
      if (e !== undefined && (best === undefined || e > best)) best = e;
      volume += tonnage(s);
      reps += s.reps ?? 0;
      distance += s.distance ?? 0;
      seconds += s.seconds ?? 0;
    }
    const pace = distance > 0 && seconds > 0 ? seconds / 60 / distance : undefined;
    return { date, sets: list, maxWeight, e1rm: best, volume, reps, distance, seconds, pace };
  });
}

// ---------------------------------------------------------------------------
// Weeks (Monday first) and streaks
// ---------------------------------------------------------------------------
export function weekStart(iso: string): string {
  const day = new Date(`${iso}T12:00:00`).getDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

export function workoutDays(sets: WorkSet[]): string[] {
  return [...new Set(sets.map((s) => s.date))].sort();
}

/** Weeks in a row with at least one workout: the current run (this week may still be empty) and the longest. */
export function weekStreaks(days: string[], today: string): { current: number; longest: number } {
  const weeks = new Set(days.map(weekStart));
  let longest = 0;
  let run = 0;
  let prev: string | undefined;
  for (const w of [...weeks].sort()) {
    run = prev && addDays(prev, 7) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = w;
  }
  const thisWeek = weekStart(today);
  let current = 0;
  let w = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (weeks.has(w)) {
    current++;
    w = addDays(w, -7);
  }
  return { current, longest };
}

/** Workouts in each of the last `count` weeks, oldest first. */
export function workoutsPerWeek(days: string[], today: string, count: number): { week: string; workouts: number }[] {
  const perWeek = new Map<string, number>();
  for (const d of days) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
  const last = weekStart(today);
  return Array.from({ length: count }, (_, i) => {
    const week = addDays(last, -7 * (count - 1 - i));
    return { week, workouts: perWeek.get(week) ?? 0 };
  });
}

export interface PartVolume {
  category: string;
  sets: number;
  tonnage: number;
}

/** Sets and kg per body part between two dates (inclusive). */
export function volumeByPart(
  sets: WorkSet[],
  byId: Map<string, Exercise>,
  from: string,
  to: string,
): Map<string, PartVolume> {
  const out = new Map<string, PartVolume>();
  for (const s of sets) {
    if (s.date < from || s.date > to) continue;
    const category = byId.get(s.exercise_id)?.category;
    if (!category) continue;
    const v = out.get(category) ?? { category, sets: 0, tonnage: 0 };
    v.sets += 1;
    v.tonnage += tonnage(s);
    out.set(category, v);
  }
  return out;
}

export interface RecentPr {
  set: WorkSet;
  /** what it beat: the best weight for at least as many reps before it */
  previous?: number;
}

/** PRs done on or after `since`, newest first. */
export function recentPrs(sets: WorkSet[], byId: Map<string, Exercise>, since: string): RecentPr[] {
  const perExercise = new Map<string, WorkSet[]>();
  for (const s of sets) {
    if (!isLift(byId.get(s.exercise_id))) continue;
    const list = perExercise.get(s.exercise_id);
    if (list) list.push(s);
    else perExercise.set(s.exercise_id, [s]);
  }
  const out: RecentPr[] = [];
  for (const list of perExercise.values()) {
    const ids = prSetIds(list);
    const sorted = [...list].sort(byTime);
    for (const s of sorted) {
      if (s.date < since || !ids.has(s.id)) continue;
      let previous: number | undefined;
      for (const p of sorted) {
        if (p === s) break;
        if ((p.reps ?? 0) >= (s.reps ?? 0) && (previous === undefined || (p.weight ?? 0) > previous))
          previous = p.weight;
      }
      out.push({ set: s, previous });
    }
  }
  return out.sort((a, b) => byTime(b.set, a.set));
}
