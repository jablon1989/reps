import type { Exercise, WorkSet } from "./types";
import type { Language } from "./i18n";

export function exerciseName(ex: Pick<Exercise, "en" | "pl"> | undefined, language: Language): string {
  if (!ex) return "?";
  return language === "pl" ? ex.pl || ex.en : ex.en || ex.pl;
}

/** "62.5" / "62,5" in Polish */
export function formatNumber(n: number, language: Language): string {
  const text = String(Math.round(n * 1000) / 1000);
  return language === "pl" ? text.replace(".", ",") : text;
}

/** Accepts "62,5" as well as "62.5". */
export function parseNumber(text: string): number | undefined {
  const cleaned = text.trim().replace(",", ".");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** "25" = 25 min, "25:30" = 25 min 30 s, "1:05:00" = 1 h 5 min. */
export function parseDuration(text: string): number | undefined {
  const parts = text.trim().split(":");
  if (!parts[0] || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
  const n = parts.map(Number);
  if (n.length === 1) return n[0] * 60;
  if (n.length === 2) return n[0] * 60 + n[1];
  return n[0] * 3600 + n[1] * 60 + n[2];
}

export function formatSet(set: WorkSet, ex: Exercise | undefined, language: Language): string {
  if (ex?.type === "cardio") {
    const parts = [];
    if (set.distance) parts.push(`${formatNumber(set.distance, language)} km`);
    if (set.seconds) parts.push(formatDuration(set.seconds));
    return parts.join(" · ");
  }
  const w = set.weight ?? 0;
  const reps = `× ${set.reps ?? 0}`;
  if (ex?.type === "bodyweight_reps") {
    if (!w) return `BW ${reps}`;
    return `BW ${w > 0 ? "+" : "−"}${formatNumber(Math.abs(w), language)} kg ${reps}`;
  }
  return `${formatNumber(w, language)} kg ${reps}`;
}

/** 12,345 kg -> "12.3 t" (or "12,3 t" in Polish); smaller -> "850 kg". */
export function formatTonnage(kg: number, language: Language): string {
  if (kg >= 1000) {
    const t = kg / 1000;
    if (t >= 100) return `${formatCount(Math.round(t), language)} t`;
    return `${formatNumber(Math.round(t * 10) / 10, language)} t`;
  }
  return `${formatNumber(Math.round(kg), language)} kg`;
}

export function formatCount(n: number, language: Language): string {
  return n.toLocaleString(language === "pl" ? "pl-PL" : "en-GB");
}

/** pace in min/km -> "5:12" */
export function formatPace(minPerKm: number): string {
  const total = Math.round(minPerKm * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
