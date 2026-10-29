import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./api";
import type { Category, Exercise, ExerciseInput } from "./types";

interface ExercisesState {
  categories: Category[];
  exercises: Exercise[];
  byId: Map<string, Exercise>;
  loading: boolean;
  error?: string;
  create: (input: ExerciseInput) => Promise<Exercise>;
  update: (id: string, input: ExerciseInput) => Promise<Exercise>;
  remove: (id: string) => Promise<void>;
}

const Ctx = createContext<ExercisesState | null>(null);

export function useExercises(): ExercisesState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useExercises outside ExercisesProvider");
  return s;
}

/** The exercise list (built-in + yours, with favourites and settings), loaded once. */
export function ExercisesProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [categories, setCategories] = useState<Category[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .exercises()
      .then((r) => {
        setCategories(r.categories);
        setExercises(r.exercises);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [api]);

  const replace = useCallback((ex: Exercise) => {
    setExercises((list) =>
      list.some((e) => e.id === ex.id) ? list.map((e) => (e.id === ex.id ? ex : e)) : [...list, ex],
    );
    return ex;
  }, []);

  const value = useMemo<ExercisesState>(
    () => ({
      categories,
      exercises,
      byId: new Map(exercises.map((e) => [e.id, e])),
      loading,
      error,
      create: (input) => api.createExercise(input).then(replace),
      update: (id, input) => {
        // Favourite/step/rest: show at once, the server copy follows.
        setExercises((list) => list.map((e) => (e.id === id ? { ...e, ...input } : e)));
        return api.updateExercise(id, input).then(replace);
      },
      remove: async (id) => {
        await api.deleteExercise(id);
        setExercises((list) => list.map((e) => (e.id === id ? { ...e, hidden: true } : e)));
      },
    }),
    [api, categories, exercises, loading, error, replace],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
