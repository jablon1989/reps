/** The summary behind the shared "us" page, worked out from your sets on the phone (pure, no React). */
import { addDays } from "./dates";
import { byTime, e1rm, isLift, recentPrs, tonnage, volumeByPart, weekStart, weekStreaks, workoutDays } from "./stats";
import type { Exercise, WorkSet } from "./types";

export const SHARED_WEEKS = 12;

/** Colours people can pick for their stats on the "us" page (CSS: .pc-<colour>). */
export const PERSON_COLORS = ["lime", "blue", "pink", "orange", "violet", "teal"] as const;
export type PersonColor = (typeof PERSON_COLORS)[number];
const PRS = 10;
const BESTS = 40;

export interface SharedWeek {
  week: string;
  workouts: number;
  sets: number;
  tonnage: number;
}

interface Named {
  exercise_id: string;
  en: string;
  pl: string;
  category: string;
}

export interface SharedPr extends Named {
  date: string;
  weight: number;
  reps: number;
}

export interface SharedBest extends Named {
  custom: boolean;
  weight: number;
  e1rm: number;
  date: string;
}

export interface SharedSummary {
  workouts: number;
  sets: number;
  tonnage: number;
  streak: number;
  longest: number;
  first: string | null;
  weeks: SharedWeek[];
  /** this month, per body part */
  parts: { category: string; sets: number; tonnage: number }[];
  prs: SharedPr[];
  bests: SharedBest[];
}

/** A high-five someone gave for a PR or a week (see prKey / weekKey). */
export interface HighFive {
  key: string;
  from_id: string;
  from: string;
  at: string;
}

export interface SharedPerson extends SharedSummary {
  /** stands for the person on the page (not their login) */
  id: string;
  fives: HighFive[];
  name: string;
  me: boolean;
  color?: PersonColor | null;
  updated_at: string;
}

/**
 * Everyone's colour: their pick (yours from the phone, so a change shows at
 * once), unless someone earlier in the list already has it; then the first free one.
 */
export function personColors(people: SharedPerson[], mine?: PersonColor): PersonColor[] {
  const taken = new Set<PersonColor>();
  return people.map((p) => {
    const wanted = (p.me ? (mine ?? p.color) : p.color) ?? undefined;
    const color =
      wanted && PERSON_COLORS.includes(wanted) && !taken.has(wanted)
        ? wanted
        : (PERSON_COLORS.find((c) => !taken.has(c)) ?? PERSON_COLORS[0]);
    taken.add(color);
    return color;
  });
}

/** What a high-five is for: a PR set, or a whole week (its Monday). */
export const prKey = (pr: Pick<SharedPr, "exercise_id" | "date" | "weight" | "reps">) =>
  `pr:${pr.exercise_id}:${pr.date}:${pr.weight}:${pr.reps}`;
export const weekKey = (week: string) => `week:${week}`;

export type FiveTarget =
  | { kind: "pr"; exercise_id: string; date: string; weight: number; reps: number }
  | { kind: "week"; week: string };

export function parseFiveKey(key: string): FiveTarget | undefined {
  const pr = /^pr:([a-z0-9-]+):(\d{4}-\d{2}-\d{2}):([\d.]+):(\d+)$/.exec(key);
  if (pr) return { kind: "pr", exercise_id: pr[1], date: pr[2], weight: Number(pr[3]), reps: Number(pr[4]) };
  const week = /^week:(\d{4}-\d{2}-\d{2})$/.exec(key);
  return week ? { kind: "week", week: week[1] } : undefined;
}

/** High-fives not seen yet (newer than `seen`), newest first. */
export function unseenFives(fives: HighFive[], seen: string | undefined): HighFive[] {
  return fives.filter((f) => !seen || f.at > seen).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const round = (n: number) => Math.round(n * 100) / 100;

function named(ex: Exercise): Named {
  return { exercise_id: ex.id, en: ex.en, pl: ex.pl, category: ex.category };
}

export function buildSummary(sets: WorkSet[], byId: Map<string, Exercise>, today: string): SharedSummary {
  const days = workoutDays(sets);
  const streak = weekStreaks(days, today);

  const last = weekStart(today);
  const first = addDays(last, -7 * (SHARED_WEEKS - 1));
  const weeks = new Map<string, SharedWeek>();
  for (let i = 0; i < SHARED_WEEKS; i++) {
    const week = addDays(first, 7 * i);
    weeks.set(week, { week, workouts: 0, sets: 0, tonnage: 0 });
  }
  const weekDays = new Set<string>();
  for (const s of sets) {
    const w = weeks.get(weekStart(s.date));
    if (!w || s.date > today) continue;
    w.sets += 1;
    w.tonnage += tonnage(s);
    if (!weekDays.has(s.date)) {
      weekDays.add(s.date);
      w.workouts += 1;
    }
  }

  const parts = [...volumeByPart(sets, byId, `${today.slice(0, 8)}01`, today).values()]
    .map((p) => ({ ...p, tonnage: round(p.tonnage) }))
    .sort((a, b) => b.sets - a.sets);

  const prs = recentPrs(sets, byId, addDays(today, -30))
    .slice(0, PRS)
    .flatMap(({ set }) => {
      const ex = byId.get(set.exercise_id);
      return ex ? [{ ...named(ex), date: set.date, weight: set.weight ?? 0, reps: set.reps ?? 0 }] : [];
    });

  // Best estimated 1RM per lift; the ones done most often first.
  const best = new Map<string, { b: SharedBest; count: number }>();
  for (const s of [...sets].sort(byTime)) {
    const ex = byId.get(s.exercise_id);
    if (!ex || !isLift(ex)) continue;
    const e = e1rm(s.weight ?? 0, s.reps ?? 0);
    const cur = best.get(ex.id) ?? {
      b: { ...named(ex), custom: ex.custom, weight: 0, e1rm: 0, date: s.date },
      count: 0,
    };
    cur.count += 1;
    if ((s.weight ?? 0) > cur.b.weight) cur.b.weight = s.weight ?? 0;
    if (e !== undefined && e > cur.b.e1rm) {
      cur.b.e1rm = round(e);
      cur.b.date = s.date;
    }
    best.set(ex.id, cur);
  }
  const bests = [...best.values()]
    .filter((x) => x.b.e1rm > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, BESTS)
    .map((x) => x.b);

  return {
    workouts: days.length,
    sets: sets.length,
    tonnage: round(sets.reduce((a, s) => a + tonnage(s), 0)),
    streak: streak.current,
    longest: streak.longest,
    first: days[0] ?? null,
    weeks: [...weeks.values()].map((w) => ({ ...w, tonnage: round(w.tonnage) })),
    parts,
    prs,
    bests,
  };
}

export interface HeadToHead {
  exercise_id: string;
  en: string;
  pl: string;
  category: string;
  /** one per person, in the people order; undefined = never done */
  bests: (SharedBest | undefined)[];
}

/** Built-in lifts that at least two people have done, most shared first. */
export function headToHead(people: SharedPerson[]): HeadToHead[] {
  const rows = new Map<string, HeadToHead>();
  people.forEach((p, i) => {
    for (const b of p.bests) {
      if (b.custom) continue; // your own exercise isn't the same as someone else's
      const row = rows.get(b.exercise_id) ?? { ...b, bests: people.map(() => undefined) };
      row.bests[i] = b;
      rows.set(b.exercise_id, row);
    }
  });
  const done = (r: HeadToHead) => r.bests.filter(Boolean).length;
  return [...rows.values()].filter((r) => done(r) >= 2).sort((a, b) => done(b) - done(a));
}
