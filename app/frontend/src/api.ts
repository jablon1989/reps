import { useMemo } from "react";
import { useSession } from "./session";
import type { Me, Person, Settings } from "./types";

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
  };
}

export type Api = ReturnType<typeof createApi>;

export function useApi(): Api {
  const { token } = useSession();
  return useMemo(() => createApi(token), [token]);
}
