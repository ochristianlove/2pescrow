import Constants from "expo-constants";

function clean(value: string | undefined): string {
  return (value || "").trim().replace(/\/$/, "");
}

/** API the phone can reach. Set EXPO_PUBLIC_API_URL. LAN example: http://10.148.130.68:3002 */
export function apiUrl(): string {
  const fromEnv = clean(process.env.EXPO_PUBLIC_API_URL);
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return clean(extra?.apiUrl) || "http://10.148.130.68:3002";
}

/** Website used for wallet signing and the public privacy page. */
export function webOrigin(): string {
  const fromEnv = clean(process.env.EXPO_PUBLIC_WEB_ORIGIN);
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { webOrigin?: string } | undefined;
  return clean(extra?.webOrigin) || "http://10.148.130.68:3003";
}

export function privacyUrl(): string {
  return `${webOrigin()}/privacy`;
}
