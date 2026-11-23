import AsyncStorage from "@react-native-async-storage/async-storage";

const WALLET_RETURN_KEY = "twopescrow.wallet_return_path";
const WALLET_RETURN_TTL_MS = 15 * 60 * 1000;

const APP_ROUTES = [
  "/auth/",
  "/trade/",
  "/trades",
  "/join-trade",
  "/new-trade",
  "/sign-in",
  "/dashboard",
  "/account",
  "/referrals",
  "/ledger",
  "/faq",
  "/feedback",
];

type StoredReturn = { path: string; at: number };

let activeTradePath: string | null = null;

export function rememberTradeReturnPath(tradeId: string | undefined) {
  if (!tradeId) return;
  const path = `/trade/${encodeURIComponent(tradeId)}`;
  activeTradePath = path;
  const payload: StoredReturn = { path, at: Date.now() };
  void AsyncStorage.setItem(WALLET_RETURN_KEY, JSON.stringify(payload)).catch(() => undefined);
}

export function clearTradeReturnPath(tradeId?: string) {
  const expected = tradeId ? `/trade/${encodeURIComponent(tradeId)}` : null;
  if (expected && activeTradePath && activeTradePath !== expected) return;
  activeTradePath = null;
  void AsyncStorage.removeItem(WALLET_RETURN_KEY).catch(() => undefined);
}

/**
 * Returns true when an incoming OS deep link is a bare wallet-return callback
 * (e.g. `twopescrow://`, `twopescrow:///`, `twopescrow://wc?...`, `https://2pescrow.com/`)
 * rather than an intentional in-app route like `/auth/verify` or `/trade/:id`.
 */
export function isWalletReturnUrl(rawUrl: string): boolean {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();

  if (lower === "/" || lower === "twopescrow://" || lower === "twopescrow:///" || lower === "com.twopescrow.app://" || lower === "com.twopescrow.app:///") {
    return true;
  }

  let scheme = "";
  let host = "";
  let pathname = "";
  try {
    const parsed = new URL(trimmed);
    scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
    host = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    // Handle relative paths like "/" or "/wc".
    pathname = lower.split("?")[0].split("#")[0];
  }

  // Never intercept explicit app routes (magic-link verification, direct trade links, etc.).
  const combinedPath = host && (scheme === "twopescrow" || scheme === "com.twopescrow.app")
    ? `/${host}${pathname === "/" ? "" : pathname}`
    : pathname;
  if (APP_ROUTES.some((prefix) => combinedPath === prefix || combinedPath.startsWith(prefix))) {
    return false;
  }

  if (scheme === "twopescrow" || scheme === "com.twopescrow.app") {
    // Bare scheme return or WalletConnect callback (`twopescrow://`, `twopescrow://wc?...`, `twopescrow://walletconnect`).
    return (
      !host
      || host === "wc"
      || host === "walletconnect"
      || pathname === ""
      || pathname === "/"
      || pathname === "/wc"
      || pathname.startsWith("/wc/")
    );
  }

  if ((scheme === "https" || scheme === "http") && (host === "2pescrow.com" || host === "www.2pescrow.com")) {
    return pathname === "" || pathname === "/" || pathname === "/wc" || pathname.startsWith("/wc/");
  }

  return false;
}

export async function resolveNativeIntentPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): Promise<string> {
  if (!path || !isWalletReturnUrl(path)) {
    return path;
  }

  // Warm return from MetaMask / Trust Wallet: return empty string so Expo Router / React Navigation
  // treats it as a no-op and keeps the user on their current screen (e.g. /trade/[id]).
  if (!initial) {
    return "";
  }

  // Cold start after iOS evicted the app while the user was signing in a wallet:
  // restore the recent trade room if one was active within the last 15 minutes.
  if (activeTradePath) {
    return activeTradePath;
  }
  try {
    const raw = await AsyncStorage.getItem(WALLET_RETURN_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<StoredReturn>;
      if (
        typeof saved.path === "string"
        && saved.path.startsWith("/trade/")
        && typeof saved.at === "number"
        && Date.now() - saved.at <= WALLET_RETURN_TTL_MS
      ) {
        return saved.path;
      }
    }
  } catch {
    // Fall back to default path.
  }

  return path;
}
