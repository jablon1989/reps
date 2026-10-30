import type { Language } from "./i18n";

export interface Settings {
  language: Language;
  /** on the shared "us" page */
  share?: boolean;
}

export interface Me {
  name: string;
  email: string;
  admin: boolean;
  /** Invited to reps only. */
  friend: boolean;
  settings: Settings;
}

export interface Person {
  name: string;
  email: string;
  friend: boolean;
  admin: boolean;
  /** FORCE_CHANGE_PASSWORD = invited, hasn't logged in yet. */
  status: string;
  enabled: boolean;
}

export type ExerciseType = "weight_reps" | "bodyweight_reps" | "cardio";

export interface Category {
  id: string;
  en: string;
  pl: string;
}

export interface Exercise {
  id: string;
  category: string;
  type: ExerciseType;
  en: string;
  pl: string;
  custom: boolean;
  /** Your own exercise you deleted: its old sets still show. */
  hidden: boolean;
  favourite: boolean;
  /** kg per +/− tap */
  step: number;
  /** rest timer, seconds */
  rest: number;
}

export interface ExerciseInput {
  en?: string;
  pl?: string;
  category?: string;
  type?: ExerciseType;
  favourite?: boolean;
  step?: number;
  rest?: number;
}

export interface WorkSet {
  id: string;
  date: string;
  exercise_id: string;
  /** when it was logged (ISO) – the order within a day */
  at: string;
  weight?: number;
  reps?: number;
  /** km */
  distance?: number;
  seconds?: number;
  comment?: string;
}

export interface Session {
  date: string;
  sets: WorkSet[];
}

export interface ImportExercise {
  name: string;
  source_category: string;
  sets: number;
  /** built-in exercise it matched, or null = becomes your own */
  builtin: string | null;
  id: string;
  category: string;
  /** we guessed the body part: worth a look */
  check_category: boolean;
  type: ExerciseType;
  favourite: boolean;
}

export interface ImportSet {
  exercise: string;
  date: string;
  n: number;
  i: number;
  weight?: number;
  reps?: number;
  distance?: number;
  seconds?: number;
  comment?: string;
}

export interface ImportPreview {
  source: "fitnotes" | "csv";
  sets: ImportSet[];
  exercises: ImportExercise[];
  days: number;
  first: string;
  last: string;
  body_weights: { date: string; weight: number; bodyfat?: number }[];
  notes: { date: string; text: string }[];
}

export interface ImportResult {
  saved: number;
  skipped: { date: string; exercise_id: string; why: string }[];
  skipped_count: number;
}

export interface RoutineItem {
  exercise_id: string;
  /** targets, both optional: "3 × 10" */
  sets?: number;
  reps?: number;
}

export interface Routine {
  id: string;
  name: string;
  exercises: RoutineItem[];
}

export const BODY_FIELDS = ["weight", "bodyfat", "waist", "chest", "arm", "thigh", "hips"] as const;
export type BodyField = (typeof BODY_FIELDS)[number];

export type BodyEntry = { id: string; date: string } & Partial<Record<BodyField, number>>;

/** Exercise goal: lift `weight` for at least `reps`. Id "body-weight": a body weight target. */
export interface Goal {
  id: string;
  weight: number;
  reps?: number;
}

export interface DayNote {
  id: string;
  text: string;
}

/** A routine started on a day (id = the date). */
export interface DayPlan {
  id: string;
  routine_id: string;
  exercise_ids: string[];
}

export interface Docs {
  routine: Routine[];
  body: BodyEntry[];
  goal: Goal[];
  note: DayNote[];
  plan: DayPlan[];
}

export interface DriveStatus {
  /** the server has a Google OAuth client (otherwise the feature is off) */
  configured: boolean;
  connected: boolean;
  email?: string;
  connected_at?: string;
  last_export?: string;
  last_error?: string;
  last_files?: string[];
}
