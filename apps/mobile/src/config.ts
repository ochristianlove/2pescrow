import Constants from "expo-constants";

function clean(value: string | undefined): string {
  return (value || "").trim().replace(/\/$/, "");
}

/** API the phone can reach. Set EXPO_PUBLIC_API_URL. LAN example: http://10.148.130.68:3002 */
export function apiUrl(): string {
  const fromEnv = clean(process.env.EXPO_PUBLIC_API_URL);
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  return clean(extra?.apiUrl) || "https://api.45.90.223.177.sslip.io";
}

/** Website used for wallet signing and the public privacy page. */
export function webOrigin(): string {
  const fromEnv = clean(process.env.EXPO_PUBLIC_WEB_ORIGIN);
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { webOrigin?: string } | undefined;
  return clean(extra?.webOrigin) || "https://2pescrow.com";
}

export function privacyUrl(): string {
  return `${webOrigin()}/privacy`;
}

const localTestProjectId = "b56e18d47c72ab683b10814fe9495694";

/** Reown project id. The env value wins, then app.json extra. Dev with neither uses Reown's public localhost id. */
export function walletConnectProjectId(): string {
  const fromEnv = clean(process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID);
  if (fromEnv) return fromEnv;
  const extra = Constants.expoConfig?.extra as { walletConnectProjectId?: string } | undefined;
  const fromExtra = clean(extra?.walletConnectProjectId);
  if (fromExtra) return fromExtra;
  if (typeof __DEV__ !== "undefined" && __DEV__) return localTestProjectId;
  return "";
}
