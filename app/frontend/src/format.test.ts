import { describe, expect, it } from "vitest";
import { addDays, todayIso } from "./dates";
import { formatDuration, formatSet, parseDuration, parseNumber } from "./format";
import type { Exercise } from "./types";

const ex = (type: Exercise["type"]) => ({ type }) as Exercise;

describe("format", () => {
  it("reads Polish decimal commas", () => {
    expect(parseNumber("62,5")).toBe(62.5);
    expect(parseNumber("62.5")).toBe(62.5);
    expect(parseNumber("-20")).toBe(-20);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("6x")).toBeUndefined();
  });

  it("reads and writes durations", () => {
    expect(parseDuration("25")).toBe(1500);
    expect(parseDuration("25:30")).toBe(1530);
    expect(parseDuration("1:05:00")).toBe(3900);
    expect(parseDuration("a")).toBeUndefined();
    expect(formatDuration(1530)).toBe("25:30");
    expect(formatDuration(3900)).toBe("1:05:00");
  });

  it("shows a set", () => {
    const set = { id: "1", date: "2026-10-29", exercise_id: "x", at: "" };
    expect(formatSet({ ...set, weight: 62.5, reps: 8 }, ex("weight_reps"), "pl")).toBe("62,5 kg × 8");
    expect(formatSet({ ...set, weight: 0, reps: 8 }, ex("bodyweight_reps"), "en")).toBe("BW × 8");
    expect(formatSet({ ...set, weight: -20, reps: 6 }, ex("bodyweight_reps"), "en")).toBe("BW −20 kg × 6");
    expect(formatSet({ ...set, distance: 5.2, seconds: 1800 }, ex("cardio"), "en")).toBe("5.2 km · 30:00");
  });

  it("moves between days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(todayIso(new Date(2026, 9, 29, 23, 30))).toBe("2026-10-29");
  });
});
