import { useMemo } from "react";
import { useSession } from "./session";
import type {
  Category,
  Exercise,
  ExerciseInput,
  ImportExercise,
  ImportPreview,
  ImportResult,
  ImportSet,
  Me,
  Person,
  Session,
  Settings,
  WorkSet,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function createApi(token: string | undefined) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token ?? ""}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = (await res.json()).message ?? message;
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, message);
    }
    return res.status === 204 ? (undefined as T) : res.json();
  }

  return {
    me: () => call<Me>("GET", "/me"),
    saveSettings: (settings: Partial<Settings>) => call<Settings>("PUT", "/me/settings", settings),
    people: () => call<{ people: Person[] }>("GET", "/admin/people").then((r) => r.people),
    invite: (email: string, name: string) =>
      call<{ email: string; name: string; new: boolean }>("POST", "/admin/invites", { email, name }),

    exercises: () => call<{ categories: Category[]; exercises: Exercise[] }>("GET", "/exercises"),
    createExercise: (input: ExerciseInput) => call<Exercise>("POST", "/exercises", input),
    updateExercise: (id: string, input: ExerciseInput) => call<Exercise>("PATCH", `/exercises/${id}`, input),
    deleteExercise: (id: string) => call<void>("DELETE", `/exercises/${id}`),
    history: (id: string, before: string, sessions = 3) =>
      call<{ sessions: Session[] }>("GET", `/exercises/${id}/history?before=${before}&sessions=${sessions}`).then(
        (r) => r.sessions,
      ),

    sets: (date: string) => call<{ sets: WorkSet[] }>("GET", `/sets?date=${date}`).then((r) => r.sets),
    saveSet: (set: WorkSet) => call<WorkSet>("PUT", `/sets/${set.id}`, set),
    deleteSet: (set: WorkSet) => call<void>("DELETE", `/sets/${set.id}?date=${set.date}`),

    importParse: (filename: string, data: string) => call<ImportPreview>("POST", "/import/parse", { filename, data }),
    importExercises: (exercises: ImportExercise[]) =>
      call<{ ids: Record<string, string> }>("POST", "/import/exercises", { exercises }).then((r) => r.ids),
    importSets: (sets: (ImportSet & { exercise_id: string })[]) => call<ImportResult>("POST", "/import/sets", { sets }),
    importUndo: () => call<{ deleted: number }>("DELETE", "/import"),
  };
}

export type Api = ReturnType<typeof createApi>;

export function useApi(): Api {
  const { token } = useSession();
  return useMemo(() => createApi(token), [token]);
}
