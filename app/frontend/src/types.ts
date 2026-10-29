import type { Language } from "./i18n";

export interface Settings {
  language: Language;
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
}

export interface ImportResult {
  saved: number;
  skipped: { date: string; exercise_id: string; why: string }[];
  skipped_count: number;
}
