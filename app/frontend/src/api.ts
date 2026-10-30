import { useMemo, useRef } from "react";
import type { T } from "./i18n";
import { useSession } from "./session";
import type {
  Category,
  Docs,
  Exercise,
  ExerciseInput,
  ImportExercise,
  ImportPreview,
  ImportResult,
  ImportSet,
  Me,
  Person,
  Settings,
} from "./types";

/** [id, date, at, exercise_id, weight, reps, distance, seconds, comment] (null = not set) */
export type AllSetsRow = [
  string,
  string,
  string,
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  string | null,
];

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  /** No answer at all: no signal, or the server can't be reached. */
  get offline(): boolean {
    return this.status === 0;
  }
}

function createApi(getToken: () => string | undefined, refresh: () => Promise<string | undefined>) {
  async function send(method: string, path: string, body: unknown, token: string | undefined): Promise<Response> {
    try {
      return await fetch(`/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, "offline");
    }
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res = await send(method, path, body, getToken());
    if (res.status === 401) {
      // The hour-long token ran out: get a new one and try once more.
      let fresh: string | undefined;
      try {
        fresh = await refresh();
      } catch {
        fresh = undefined;
      }
      if (fresh) res = await send(method, path, body, fresh);
    }
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
    /** Any call, e.g. one waiting in the sync queue. */
    request: <T = unknown>(method: string, path: string, body?: unknown) => call<T>(method, path, body),
    me: () => call<Me>("GET", "/me"),
    saveSettings: (settings: Partial<Settings>) => call<Settings>("PUT", "/me/settings", settings),
    people: () => call<{ people: Person[] }>("GET", "/admin/people").then((r) => r.people),
    invite: (email: string, name: string) =>
      call<{ email: string; name: string; new: boolean }>("POST", "/admin/invites", { email, name }),

    exercises: () => call<{ categories: Category[]; exercises: Exercise[] }>("GET", "/exercises"),
    createExercise: (input: ExerciseInput) => call<Exercise>("POST", "/exercises", input),
    updateExercise: (id: string, input: ExerciseInput) => call<Exercise>("PATCH", `/exercises/${id}`, input),
    deleteExercise: (id: string) => call<void>("DELETE", `/exercises/${id}`),

    /** All your sets, compact rows, page by page. */
    allSets: (cursor?: string) =>
      call<{
        sets: AllSetsRow[];
        next: string | null;
      }>("GET", `/sets/all${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),

    importParse: (filename: string, data: string) => call<ImportPreview>("POST", "/import/parse", { filename, data }),
    importExercises: (exercises: ImportExercise[]) =>
      call<{ ids: Record<string, string> }>("POST", "/import/exercises", { exercises }).then((r) => r.ids),
    importSets: (sets: (ImportSet & { exercise_id: string })[]) => call<ImportResult>("POST", "/import/sets", { sets }),
    importExtras: (body_weights: unknown[], notes: unknown[]) =>
      call<{ body: number; note: number }>("POST", "/import/extras", { body_weights, notes }),
    docs: () => call<Docs>("GET", "/docs"),
    importUndo: () => call<{ deleted: number }>("DELETE", "/import"),
  };
}

export type Api = ReturnType<typeof createApi>;

/** The API, with the current token. Stays the same object when the token is refreshed. */
export function useApi(): Api {
  const session = useSession();
  const ref = useRef(session);
  ref.current = session;
  return useMemo(
    () =>
      createApi(
        () => ref.current.token,
        () => ref.current.refresh(),
      ),
    [],
  );
}

/** An error for people: "needs a connection" instead of "offline". */
export function errorText(err: unknown, t: T): string {
  return err instanceof ApiError && err.offline ? t("needsSignal") : (err as Error).message;
}
