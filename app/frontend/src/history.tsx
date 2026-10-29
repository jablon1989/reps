import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { byTime } from "./stats";
import type { WorkSet } from "./types";

interface HistoryState {
  /** every set, oldest first; undefined while loading */
  sets?: WorkSet[];
  error?: string;
  /** one exercise's sets, oldest first */
  forExercise: (exerciseId: string) => WorkSet[];
  /** keep in step with what the pages save/delete, without loading everything again */
  upsert: (set: WorkSet) => void;
  remove: (id: string) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<HistoryState | null>(null);

export function useHistory(): HistoryState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useHistory outside HistoryProvider");
  return s;
}

/** All your sets, loaded once after login, for records and stats. */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [sets, setSets] = useState<WorkSet[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const all: WorkSet[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.allSets(cursor);
        for (const [id, date, at, exercise_id, weight, reps, distance, seconds] of page.sets) {
          const s: WorkSet = { id, date, at, exercise_id };
          if (weight !== null) s.weight = weight;
          if (reps !== null) s.reps = reps;
          if (distance !== null) s.distance = distance;
          if (seconds !== null) s.seconds = seconds;
          all.push(s);
        }
        cursor = page.next ?? undefined;
      } while (cursor);
      setSets(all.sort(byTime));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const byExercise = useMemo(() => {
    const map = new Map<string, WorkSet[]>();
    for (const s of sets ?? []) {
      const list = map.get(s.exercise_id);
      if (list) list.push(s);
      else map.set(s.exercise_id, [s]);
    }
    return map;
  }, [sets]);

  const value = useMemo<HistoryState>(
    () => ({
      sets,
      error,
      forExercise: (id) => byExercise.get(id) ?? [],
      upsert: (set) => setSets((all) => all && [...all.filter((s) => s.id !== set.id), set].sort(byTime)),
      remove: (id) => setSets((all) => all?.filter((s) => s.id !== id)),
      reload: load,
    }),
    [sets, error, byExercise, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
