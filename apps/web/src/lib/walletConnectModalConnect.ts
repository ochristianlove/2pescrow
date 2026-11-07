import { isMobileClient } from "./mobileClient";

/** Maps WalletConnect connect errors to user-facing copy. */
export function normalizeWalletConnectConnectError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (lower.includes("no internet") || lower.includes("offline")) {
    return "WalletConnect could not reach its relay. Check your connection and try WalletConnect again.";
  }
  if (
    lower === "subscribe" ||
    lower.includes("subscribekey") ||
    (lower.includes("subscribe") && lower.length < 48)
  ) {
    return "WalletConnect could not start the connection. Close any wallet popup, return here, and tap WalletConnect again.";
  }
  if (lower.includes("connection request reset")) {
    return "Connection was interrupted. Tap WalletConnect and choose your wallet app again.";
  }
  return raw;
}

export function walletConnectPendingHint(): string {
  if (isMobileClient()) {
    return "Complete the connection in the WalletConnect window, then approve in your wallet app. Keep this page open until you finish.";
  }
  return "Scan the QR code with your mobile wallet. Keep this page open until you approve — closing this screen cancels the connection.";
}
