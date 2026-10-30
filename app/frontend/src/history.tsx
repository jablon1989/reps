import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { idbGet, idbSet } from "./idb";
import { byTime } from "./stats";
import { useSync, type Change } from "./sync";
import type { WorkSet } from "./types";

interface HistoryState {
  /** every set, oldest first; undefined until there's something (phone or server) */
  sets?: WorkSet[];
  error?: string;
  /** true once the server's copy has been loaded this session */
  fresh: boolean;
  /** one exercise's sets, oldest first */
  forExercise: (exerciseId: string) => WorkSet[];
  /** Save / delete: on the phone at once, sent to the server by the sync queue. */
  saveSet: (set: WorkSet) => void;
  deleteSet: (set: WorkSet) => void;
  reload: () => Promise<void>;
}

const Ctx = createContext<HistoryState | null>(null);

export function useHistory(): HistoryState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useHistory outside HistoryProvider");
  return s;
}

/** Lay changes that haven't reached the server yet over the server's list. */
export function applyWaiting(sets: WorkSet[], waiting: Change[]): WorkSet[] {
  const byId = new Map(sets.map((s) => [s.id, s]));
  for (const c of waiting) {
    if (!c.path.startsWith("/sets/")) continue;
    const id = decodeURIComponent(c.path.slice("/sets/".length).split("?")[0]);
    if (c.method === "PUT") byId.set(id, c.body as WorkSet);
    else if (c.method === "DELETE") byId.delete(id);
  }
  return [...byId.values()].sort(byTime);
}

/**
 * All your sets: the copy on the phone straight away, then the server's.
 * Every page reads from here, so logging works the same with or without signal.
 */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const sync = useSync();
  const key = sync.storeKey("sets");
  const [sets, setSets] = useState<WorkSet[]>();
  const [error, setError] = useState<string>();
  const [fresh, setFresh] = useState(false);
  const saveTimer = useRef<number>(undefined);

  // Write to the phone a moment after changes stop (the list can be big).
  const persist = useCallback(
    (list: WorkSet[]) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => idbSet(key, list), 500);
    },
    [key],
  );

  const load = useCallback(async () => {
    try {
      const all: WorkSet[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.allSets(cursor);
        for (const [id, date, at, exercise_id, weight, reps, distance, seconds, comment] of page.sets) {
          const s: WorkSet = { id, date, at, exercise_id };
          if (weight !== null) s.weight = weight;
          if (reps !== null) s.reps = reps;
          if (distance !== null) s.distance = distance;
          if (seconds !== null) s.seconds = seconds;
          if (comment) s.comment = comment;
          all.push(s);
        }
        cursor = page.next ?? undefined;
      } while (cursor);
      const list = applyWaiting(all, sync.waiting());
      setSets(list);
      persist(list);
      setFresh(true);
      setError(undefined);
    } catch (e) {
      // No signal: the phone's copy (if any) stays.
      setError((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, persist]);

  useEffect(() => {
    let stale = false;
    idbGet<WorkSet[]>(key).then((cached) => {
      if (cached && !stale) setSets((s) => s ?? applyWaiting(cached, sync.waiting()));
    });
    load();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, load]);

  // Back online: catch up with changes made on another phone.
  useEffect(() => {
    const back = () => load();
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
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
      fresh,
      forExercise: (id) => byExercise.get(id) ?? [],
      saveSet: (set) => {
        setSets((all) => {
          const next = [...(all ?? []).filter((s) => s.id !== set.id), set].sort(byTime);
          persist(next);
          return next;
        });
        sync.queue({ method: "PUT", path: `/sets/${encodeURIComponent(set.id)}`, body: set });
      },
      deleteSet: (set) => {
        setSets((all) => {
          const next = (all ?? []).filter((s) => s.id !== set.id);
          persist(next);
          return next;
        });
        sync.queue({ method: "DELETE", path: `/sets/${encodeURIComponent(set.id)}?date=${set.date}` });
      },
      reload: load,
    }),
    [sets, error, fresh, byExercise, load, persist, sync],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
