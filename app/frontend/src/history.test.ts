import { describe, expect, it } from "vitest";
import { applyWaiting } from "./history";
import type { WorkSet } from "./types";

const set = (id: string, date: string, weight = 50): WorkSet => ({
  id,
  date,
  at: `${date}T12:00:00`,
  exercise_id: "bench",
  weight,
  reps: 10,
});

describe("changes waiting to sync", () => {
  it("lay over the server's sets", () => {
    const server = [set("a", "2026-10-28"), set("b", "2026-10-29")];
    const result = applyWaiting(server, [
      { id: "1", method: "PUT", path: "/sets/c", body: set("c", "2026-10-30") },
      { id: "2", method: "PUT", path: "/sets/a", body: set("a", "2026-10-28", 60) },
      { id: "3", method: "DELETE", path: "/sets/b?date=2026-10-29" },
      { id: "4", method: "PATCH", path: "/exercises/bench", body: { favourite: true } },
    ]);
    expect(result.map((s) => [s.id, s.weight])).toEqual([
      ["a", 60],
      ["c", 50],
    ]);
  });

  it("a set saved then deleted offline is gone", () => {
    const result = applyWaiting(
      [],
      [
        { id: "1", method: "PUT", path: "/sets/x", body: set("x", "2026-10-30") },
        { id: "2", method: "DELETE", path: "/sets/x?date=2026-10-30" },
      ],
    );
    expect(result).toEqual([]);
  });
});
