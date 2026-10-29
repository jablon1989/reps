import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, useApi } from "./api";
import { LanguageProvider, browserLanguage, type Language } from "./i18n";
import type { Me } from "./types";

interface MeState {
  me: Me;
  setLanguage: (language: Language) => Promise<void>;
}

const MeContext = createContext<MeState | null>(null);

export function useMe(): MeState {
  const s = useContext(MeContext);
  if (!s) throw new Error("useMe outside MeProvider");
  return s;
}

type Status = { kind: "loading" } | { kind: "error"; error: ApiError | Error } | { kind: "ready"; me: Me };

/** Loads who you are (and your settings) once after login. */
export function MeProvider({ fallback, children }: { fallback: (s: Status) => ReactNode; children: ReactNode }) {
  const api = useApi();
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(() => {
    setStatus({ kind: "loading" });
    api
      .me()
      .then((me) => setStatus({ kind: "ready", me }))
      .catch((error: Error) => setStatus({ kind: "error", error }));
  }, [api]);
  useEffect(load, [load]);

  const setLanguage = useCallback(
    async (language: Language) => {
      // Switch right away; the server copy follows.
      setStatus((s) => (s.kind === "ready" ? { ...s, me: { ...s.me, settings: { ...s.me.settings, language } } } : s));
      await api.saveSettings({ language });
    },
    [api],
  );

  if (status.kind !== "ready") {
    return <LanguageProvider language={browserLanguage()}>{fallback(status)}</LanguageProvider>;
  }
  return (
    <MeContext.Provider value={{ me: status.me, setLanguage }}>
      <LanguageProvider language={status.me.settings.language}>{children}</LanguageProvider>
    </MeContext.Provider>
  );
}

export type { Status as MeStatus };
