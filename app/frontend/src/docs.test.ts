import { describe, expect, it } from "vitest";
import { applyWaitingDocs } from "./docs";
import type { Docs } from "./types";

const empty: Docs = { routine: [], body: [], goal: [], note: [], plan: [] };

describe("documents waiting to sync", () => {
  it("lay over the server's copy", () => {
    const server: Docs = {
      ...empty,
      note: [{ id: "2026-10-29", text: "old" }],
      goal: [{ id: "deadlift", weight: 150 }],
    };
    const out = applyWaitingDocs(server, [
      { id: "1", method: "PUT", path: "/docs/note/2026-10-29", body: { text: "new" } },
      { id: "2", method: "PUT", path: "/docs/body/2026-10-30", body: { date: "2026-10-30", weight: 82 } },
      { id: "3", method: "DELETE", path: "/docs/goal/deadlift" },
      { id: "4", method: "PUT", path: "/sets/abc", body: {} },
    ]);
    expect(out.note).toEqual([{ id: "2026-10-29", text: "new" }]);
    expect(out.body).toEqual([{ id: "2026-10-30", date: "2026-10-30", weight: 82 }]);
    expect(out.goal).toEqual([]);
  });
});
