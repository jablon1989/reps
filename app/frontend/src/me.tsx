import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, useApi } from "./api";
import { LanguageProvider, browserLanguage, type Language } from "./i18n";
import { idbGet, idbSet } from "./idb";
import { useSync } from "./sync";
import type { PersonColor } from "./shared";
import type { Me } from "./types";

interface MeState {
  me: Me;
  setLanguage: (language: Language) => void;
  setShare: (share: boolean) => void;
  setColor: (color: PersonColor) => void;
}

const MeContext = createContext<MeState | null>(null);

export function useMe(): MeState {
  const s = useContext(MeContext);
  if (!s) throw new Error("useMe outside MeProvider");
  return s;
}

type Status = { kind: "loading" } | { kind: "error"; error: ApiError | Error } | { kind: "ready"; me: Me };

/** Who you are (and your settings): from the phone at once, then fresh from the server. */
export function MeProvider({ fallback, children }: { fallback: (s: Status) => ReactNode; children: ReactNode }) {
  const api = useApi();
  const sync = useSync();
  const key = sync.storeKey("me");
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let stale = false;
    let fromServer = false;
    idbGet<Me>(key).then((cached) => {
      if (cached && !stale && !fromServer) setStatus({ kind: "ready", me: cached });
    });
    api
      .me()
      .then((me) => {
        fromServer = true;
        if (stale) return;
        // A language change still waiting to sync wins over the server's copy.
        const waiting = sync
          .waiting()
          .filter((c) => c.path === "/me/settings")
          .map((c) => c.body as Partial<Me["settings"]>);
        const merged = { ...me, settings: Object.assign({}, me.settings, ...waiting) };
        setStatus({ kind: "ready", me: merged });
        idbSet(key, merged);
      })
      .catch((error: ApiError) => {
        if (stale) return;
        // Offline with a copy on the phone: keep going with it.
        if (error.offline) {
          idbGet<Me>(key).then(
            (cached) => !stale && setStatus(cached ? { kind: "ready", me: cached } : { kind: "error", error }),
          );
        } else {
          setStatus({ kind: "error", error });
        }
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key]);

  const save = useCallback(
    (change: Partial<Me["settings"]>) => {
      setStatus((s) => {
        if (s.kind !== "ready") return s;
        const me = { ...s.me, settings: { ...s.me.settings, ...change } };
        idbSet(key, me);
        return { ...s, me };
      });
      sync.queue({ method: "PUT", path: "/me/settings", body: change });
    },
    [key, sync],
  );
  const setLanguage = useCallback((language: Language) => save({ language }), [save]);
  const setShare = useCallback((share: boolean) => save({ share }), [save]);
  const setColor = useCallback((color: PersonColor) => save({ color }), [save]);

  if (status.kind !== "ready") {
    return <LanguageProvider language={browserLanguage()}>{fallback(status)}</LanguageProvider>;
  }
  return (
    <MeContext.Provider value={{ me: status.me, setLanguage, setShare, setColor }}>
      <LanguageProvider language={status.me.settings.language}>{children}</LanguageProvider>
    </MeContext.Provider>
  );
}

export type { Status as MeStatus };
