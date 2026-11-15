import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from "react";
import { formatTranslation, languageOptions, type Language } from "../../../../packages/shared/src/i18n/catalog";
export { languageOptions };
export type { Language };
type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: (english: string, values?: Record<string, string | number>) => string };
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem("2pescrow_language") as Language | null;
      return languageOptions.some((option) => option.id === saved) ? saved! : "en";
    } catch { return "en"; }
  });
  const setLanguage = (next: Language) => {
    try { localStorage.setItem("2pescrow_language", next); } catch { /* Storage can be unavailable in private browsing. */ }
    setLanguageState(next);
  };
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (english: string, values?: Record<string, string | number>) => formatTranslation(language, english, values),
    }),
    [language]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

/** A reactive text-only boundary for static copy, including nested helpers. */
export function TranslatedText({ text }: { text: string }) {
  const { t } = useLanguage();
  return <>{t(text)}</>;
}
