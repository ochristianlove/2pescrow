import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text as NativeText, TextInput as NativeTextInput, type TextProps, type TextInputProps } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatTranslation, languageOptions, type Language } from "../../../packages/shared/src/i18n/catalog";
export { languageOptions };
export type { Language };
const LanguageContext = createContext({ language: "en" as Language, setLanguage: (_: Language) => {}, t: (text: string, _values?: Record<string, string | number>) => text });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("en");
  const changed = useRef(false);
  useEffect(() => { void AsyncStorage.getItem("2pescrow.language").then(saved => { if (!changed.current && languageOptions.some(option => option.id === saved)) updateLanguage(saved as Language); }).catch(() => {}); }, []);
  const value = useMemo(() => ({ language, setLanguage: (next: Language) => { changed.current = true; updateLanguage(next); void AsyncStorage.setItem("2pescrow.language", next).catch(() => {}); }, t: (text: string, values?: Record<string, string | number>) => formatTranslation(language, text, values) }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() { return useContext(LanguageContext); }
// Only catalogued product copy is translated. User-authored content opts out.
export function Text({ children, translate: enabled = true, ...props }: TextProps & { translate?: boolean }) {
  const { t } = useLanguage();
  function localize(child: ReactNode): ReactNode {
    if (typeof child === "string") return enabled ? t(child) : child;
    return Array.isArray(child) ? child.map(localize) : child;
  }
  return <NativeText {...props} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined}>{localize(children)}</NativeText>;
}
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput(props, ref) {
  const { t } = useLanguage();
  return <NativeTextInput {...props} ref={ref} placeholder={props.placeholder ? t(props.placeholder) : undefined} accessibilityLabel={props.accessibilityLabel ? t(props.accessibilityLabel) : undefined} accessibilityHint={props.accessibilityHint ? t(props.accessibilityHint) : undefined} />;
});
