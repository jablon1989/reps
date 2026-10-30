import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import { idbGet, idbSet } from "./idb";
import { useSync } from "./sync";
import type { Category, Exercise, ExerciseInput } from "./types";

interface ExercisesState {
  categories: Category[];
  exercises: Exercise[];
  byId: Map<string, Exercise>;
  loading: boolean;
  error?: string;
  /** New / renamed / deleted own exercises need the server (no signal: an error). */
  create: (input: ExerciseInput) => Promise<Exercise>;
  update: (id: string, input: ExerciseInput) => Promise<Exercise | undefined>;
  remove: (id: string) => Promise<void>;
  /** Load again (after an import added exercises). */
  reload: () => Promise<void>;
}

interface Stored {
  categories: Category[];
  exercises: Exercise[];
}

const Ctx = createContext<ExercisesState | null>(null);

export function useExercises(): ExercisesState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useExercises outside ExercisesProvider");
  return s;
}

const PREFS = ["favourite", "step", "rest"] as const;

/** The exercise list (built-in + yours, favourites, settings): from the phone at once, then the server's. */
export function ExercisesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const sync = useSync();
  const key = sync.storeKey("exercises");
  const [data, setData] = useState<Stored>({ categories: [], exercises: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const keep = useCallback(
    (next: Stored) => {
      setData(next);
      idbSet(key, next);
    },
    [key],
  );

  const load = useCallback(async () => {
    try {
      const fresh = await api.exercises();
      // Favourite/step/rest changes still waiting to sync win over the server's copy.
      for (const c of sync.waiting()) {
        const id = c.path.startsWith("/exercises/") ? c.path.slice("/exercises/".length) : undefined;
        if (id && c.method === "PATCH")
          fresh.exercises = fresh.exercises.map((e) => (e.id === id ? { ...e, ...(c.body as ExerciseInput) } : e));
      }
      keep(fresh);
      setError(undefined);
    } catch (e) {
      const cached = await idbGet<Stored>(key);
      if (cached) setData(cached);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key, keep]);

  useEffect(() => {
    let stale = false;
    idbGet<Stored>(key).then((cached) => {
      if (cached && !stale) {
        setData((d) => (d.exercises.length ? d : cached));
        setLoading(false);
      }
    });
    load();
    return () => {
      stale = true;
    };
  }, [key, load]);

  const replace = useCallback(
    (ex: Exercise) => {
      setData((d) => {
        const exercises = d.exercises.some((e) => e.id === ex.id)
          ? d.exercises.map((e) => (e.id === ex.id ? ex : e))
          : [...d.exercises, ex];
        const next = { ...d, exercises };
        idbSet(key, next);
        return next;
      });
      return ex;
    },
    [key],
  );

  const value = useMemo<ExercisesState>(
    () => ({
      categories: data.categories,
      exercises: data.exercises,
      byId: new Map(data.exercises.map((e) => [e.id, e])),
      loading,
      error,
      create: (input) => api.createExercise(input).then(replace),
      update: async (id, input) => {
        const current = data.exercises.find((e) => e.id === id);
        const prefsOnly = Object.keys(input).every((k) => (PREFS as readonly string[]).includes(k));
        if (prefsOnly) {
          // Favourite / step / rest: works offline, synced later.
          if (current) replace({ ...current, ...input });
          sync.queue({ method: "PATCH", path: `/exercises/${id}`, body: input });
          return current && { ...current, ...input };
        }
        return replace(await api.updateExercise(id, input));
      },
      remove: async (id) => {
        await api.deleteExercise(id);
        const current = data.exercises.find((e) => e.id === id);
        if (current) replace({ ...current, hidden: true });
      },
      reload: load,
    }),
    [api, data, loading, error, replace, load, sync],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
