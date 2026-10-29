import type { Language } from "./i18n";

/** The phone's date, YYYY-MM-DD (not UTC: a late workout stays on its day). */
export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayIso(d);
}

export function formatDay(iso: string, language: Language, withYear = false): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(language === "pl" ? "pl-PL" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}
