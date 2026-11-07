import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { PlatformSettings } from "./types";

type Ctx = {
  settings: PlatformSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const PlatformSettingsContext = createContext<Ctx>({
  settings: null,
  loading: true,
  refresh: async () => undefined,
});

export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setSettings(await api<PlatformSettings>("/v1/settings"));
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <PlatformSettingsContext.Provider value={{ settings, loading, refresh }}>
      {children}
    </PlatformSettingsContext.Provider>
  );
}

export function usePlatformSettings() {
  return useContext(PlatformSettingsContext);
}
