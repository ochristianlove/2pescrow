import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "./api";
import { setMemoryToken } from "./session";
import type { SessionUser } from "./types";
import { unregisterCurrentPushToken } from "./pushNotifications";

const TOKEN_KEY = "twopescrow.session";

type AuthValue = {
  ready: boolean;
  user: SessionUser | null;
  signInWithToken: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  const applyToken = useCallback(async (token: string | null) => {
    setMemoryToken(token);
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api<SessionUser>("/v1/auth/me");
    setUser(me);
  }, []);

  const signInWithToken = useCallback(async (token: string) => {
    await applyToken(token);
    try {
      await refresh();
    } catch (error) {
      await applyToken(null);
      setUser(null);
      throw error;
    }
  }, [applyToken, refresh]);

    const signOut = useCallback(async () => {
    await unregisterCurrentPushToken().catch(() => undefined);
    await applyToken(null);
    setUser(null);
  }, [applyToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          setMemoryToken(stored);
          const me = await api<SessionUser>("/v1/auth/me");
          if (!cancelled) setUser(me);
        }
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 0)) {
          await applyToken(null);
        }
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyToken]);

  const value = useMemo(
    () => ({ ready, user, signInWithToken, refresh, signOut }),
    [ready, user, signInWithToken, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}
