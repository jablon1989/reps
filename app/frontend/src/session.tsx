import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "react-oidc-context";
import type { AppConfig } from "./config";

/** Who is playing, and the token for API calls. Same shape for Cognito and local dev. */
export interface Session {
  loading: boolean;
  error?: string;
  player?: string;
  token?: string;
  /** Local dev only: the players you can switch between. */
  devPlayers?: string[];
  login: (player?: string) => void;
  logout: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside a session provider");
  return s;
}

/** Production: Cognito hosted login. The ID token carries the player's name. */
export function CognitoSession({ config, children }: { config: AppConfig; children: ReactNode }) {
  const auth = useAuth();
  const value = useMemo<Session>(() => {
    const profile = auth.user?.profile;
    return {
      loading: auth.isLoading || !!auth.activeNavigator,
      error: auth.error?.message,
      player: auth.isAuthenticated ? String(profile?.name ?? profile?.email ?? "") : undefined,
      token: auth.user?.id_token,
      login: () => auth.signinRedirect({ state: { returnTo: window.location.pathname + window.location.search } }),
      logout: async () => {
        await auth.removeUser();
        const back = encodeURIComponent(`${window.location.origin}/`);
        window.location.href = `${config.cognitoDomain}/logout?client_id=${config.clientId}&logout_uri=${back}`;
      },
    };
  }, [auth, config]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const DEV_KEY = "reps-dev-player";

function readDevPlayer(): string | undefined {
  try {
    return localStorage.getItem(DEV_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Local dev (`make local`): no passwords, pick who you are. The fake backend trusts it. */
export function DevSession({ players, children }: { players: string[]; children: ReactNode }) {
  const [player, setPlayer] = useState<string | undefined>(readDevPlayer);
  const login = useCallback((p?: string) => {
    if (!p) return;
    try {
      localStorage.setItem(DEV_KEY, p);
    } catch {
      /* private mode */
    }
    setPlayer(p);
  }, []);
  const logout = useCallback(() => {
    try {
      localStorage.removeItem(DEV_KEY);
    } catch {
      /* private mode */
    }
    setPlayer(undefined);
  }, []);
  const value = useMemo<Session>(
    () => ({
      loading: false,
      player,
      token: player ? `dev:${encodeURIComponent(player)}` : undefined,
      devPlayers: players,
      login,
      logout,
    }),
    [player, players, login, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
