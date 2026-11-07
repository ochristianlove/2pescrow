import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export type SessionUser = {
  id: string;
  email: string | null;
  role: string;
  displayName: string | null;
  permissions?: string[];
  wallets?: { id: string; address: string }[];
};

type AuthCtx = {
  user: SessionUser | null;
  token: string | null;
  loading: boolean;
  setSession: (token: string, user: SessionUser) => void;
  refresh: () => Promise<void>;
  signOut: () => void;
  authHeaders: () => Record<string, string>;
};

const TOKEN_KEY = "2pescrow_token";
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const setSession = useCallback((nextToken: string, nextUser: SessionUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const refresh = useCallback(async () => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<SessionUser>("/v1/auth/me", {
        headers: { Authorization: `Bearer ${t}` },
      });
      setToken(t);
      setUser(me);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const unauthorized = /sign in required|invalid or expired|user not found/i.test(message);
      if (unauthorized) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      setSession,
      refresh,
      signOut,
      authHeaders: (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [user, token, loading, setSession, refresh, signOut]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
