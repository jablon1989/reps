import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, useApi } from "./api";
import { idbClear, idbGet, idbSet } from "./idb";
import { useSession } from "./session";

/**
 * Changes made on the phone wait here until the server has them. Every queued
 * call is safe to send twice (PUT a set with its own id, DELETE, PATCH prefs),
 * so a call that may or may not have arrived is simply sent again.
 */
export interface Change {
  id: string;
  method: "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
}

export interface Failed {
  change: Change;
  message: string;
}

interface SyncState {
  online: boolean;
  pending: number;
  syncing: boolean;
  failed: Failed[];
  /** the queue's own key prefix: where this person's data is kept on the phone */
  storeKey: (name: string) => string;
  queue: (change: Omit<Change, "id">) => void;
  /** changes not yet sent (to lay over data freshly loaded from the server) */
  waiting: () => Change[];
  dismissFailed: () => void;
  syncNow: () => void;
  /** Log out and remove this person's data from the phone. */
  logoutAndForget: () => Promise<void>;
}

const Ctx = createContext<SyncState | null>(null);

export function useSync(): SyncState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSync outside SyncProvider");
  return s;
}

const RETRY_MS = 30_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const session = useSession();
  const prefix = `reps:${session.userKey ?? "anon"}:`;
  const outboxKey = `${prefix}outbox`;
  const queueRef = useRef<Change[]>([]);
  const [pending, setPending] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const flushing = useRef(false);

  const save = useCallback(() => {
    setPending(queueRef.current.length);
    return idbSet(outboxKey, queueRef.current);
  }, [outboxKey]);

  const flush = useCallback(async () => {
    if (flushing.current || !queueRef.current.length) return;
    flushing.current = true;
    setSyncing(true);
    try {
      while (queueRef.current.length) {
        const change = queueRef.current[0];
        try {
          await api.request(change.method, change.path, change.body);
          setOnline(true);
        } catch (e) {
          const err = e as ApiError;
          if (err.offline || err.status === 401 || err.status >= 500 || err.status === 429) {
            // Try again later; keep the order.
            if (err.offline) setOnline(false);
            break;
          }
          // The server said no (e.g. a value it won't take): don't block the rest.
          setFailed((f) => [...f, { change, message: err.message }]);
        }
        queueRef.current = queueRef.current.slice(1);
        await save();
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [api, save]);

  // Load what was waiting from last time.
  useEffect(() => {
    let stale = false;
    idbGet<Change[]>(outboxKey).then((saved) => {
      if (stale) return;
      queueRef.current = [...(saved ?? []), ...queueRef.current];
      setPending(queueRef.current.length);
      setLoaded(true);
    });
    return () => {
      stale = true;
    };
  }, [outboxKey]);

  // Send when we can: at start, when the signal is back, when the app comes to the front, and every 30 s.
  useEffect(() => {
    if (!loaded) return;
    flush();
    const back = () => {
      setOnline(true);
      flush();
    };
    const gone = () => setOnline(false);
    const visible = () => document.visibilityState === "visible" && flush();
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => queueRef.current.length && flush(), RETRY_MS);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", gone);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }, [loaded, flush]);

  const value = useMemo<SyncState>(
    () => ({
      online,
      pending,
      syncing,
      failed,
      storeKey: (name) => `${prefix}${name}`,
      queue: (change) => {
        queueRef.current = [
          ...queueRef.current,
          { ...change, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
        ];
        save().then(flush);
      },
      waiting: () => queueRef.current,
      dismissFailed: () => setFailed([]),
      syncNow: () => flush(),
      logoutAndForget: async () => {
        await idbClear(prefix);
        session.logout();
      },
    }),
    [online, pending, syncing, failed, prefix, save, flush, session],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
