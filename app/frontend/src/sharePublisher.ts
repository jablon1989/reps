import { useEffect, useRef } from "react";
import { ApiError, useApi, type Api } from "./api";
import { todayIso } from "./dates";
import { useExercises } from "./exercises";
import { useHistory } from "./history";
import { idbGet, idbSet } from "./idb";
import { useMe } from "./me";
import { buildSummary, type SharedSummary } from "./shared";
import { useSync } from "./sync";

const DELAY_MS = 4000;

/** Send the summary if it changed since the last time it was sent. */
export async function publish(api: Api, key: string, summary: SharedSummary): Promise<boolean> {
  const text = JSON.stringify(summary);
  if ((await idbGet<string>(key)) === text) return false;
  try {
    await api.putShared(summary);
  } catch (err) {
    // 409: the server hasn't got "share" yet (it's still in the sync queue).
    if (err instanceof ApiError && (err.offline || err.status === 409)) return false;
    throw err;
  }
  await idbSet(key, text);
  return true;
}

/**
 * While sharing is on, keep your summary on the "us" page fresh: a few seconds
 * after your sets change, once nothing is waiting to sync.
 */
export function useSharePublisher(): void {
  const api = useApi();
  const sync = useSync();
  const { me } = useMe();
  const { sets } = useHistory();
  const { byId, loading } = useExercises();
  const key = sync.storeKey("shared-sent");
  const busy = useRef(false);
  const share = !!me.settings.share;

  useEffect(() => {
    if (!share || !sets || loading || !sync.online || sync.pending) return;
    const timer = window.setTimeout(() => {
      if (busy.current) return;
      busy.current = true;
      publish(api, key, buildSummary(sets, byId, todayIso()))
        .catch(() => undefined) // tried again on the next change
        .finally(() => (busy.current = false));
    }, DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [share, sets, byId, loading, sync.online, sync.pending, api, key]);

  // Turning sharing off: forget what was sent, so turning it on again sends it.
  useEffect(() => {
    if (!share) idbSet(key, "");
  }, [share, key]);
}
