import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "./api";
import { setMemoryToken } from "./session";
import type { SessionUser } from "./types";
import { unregisterCurrentPushToken } from "./pushNotifications";

const TOKEN_KEY = "twopescrow.session";
const PROFILE_KEY = "twopescrow.profile";

async function readCachedProfile(): Promise<SessionUser | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedProfile(user: SessionUser | null) {
  if (!user) {
    void AsyncStorage.removeItem(PROFILE_KEY).catch(() => undefined);
    return;
  }
  void AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(user)).catch(() => undefined);
}

async function readStoredTokenSafe(): Promise<string | null> {
  try {
    return await Promise.race([
      SecureStore.getItemAsync(TOKEN_KEY),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
  } catch {
    return null;
  }
}

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
    try {
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // Ignore secure store errors on restricted devices
    }
  }, []);

  const refresh = useCallback(async () => {
    const me = await api<SessionUser>("/v1/auth/me");
    setUser(me);
    writeCachedProfile(me);
  }, []);

  const signInWithToken = useCallback(async (token: string) => {
    await applyToken(token);
    try {
      await refresh();
    } catch (error) {
      await applyToken(null);
      setUser(null);
      writeCachedProfile(null);
      throw error;
    }
  }, [applyToken, refresh]);

  const signOut = useCallback(async () => {
    await unregisterCurrentPushToken().catch(() => undefined);
    await applyToken(null);
    setUser(null);
    writeCachedProfile(null);
  }, [applyToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await readStoredTokenSafe();
        if (!stored) {
          if (!cancelled) setReady(true);
          return;
        }
        setMemoryToken(stored);
        const cached = await readCachedProfile();
        if (!cancelled && cached) {
          setUser(cached);
          setReady(true);
        }
        const me = await api<SessionUser>("/v1/auth/me");
        if (!cancelled) setUser(me);
        writeCachedProfile(me);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await applyToken(null);
          writeCachedProfile(null);
          if (!cancelled) setUser(null);
        }
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
