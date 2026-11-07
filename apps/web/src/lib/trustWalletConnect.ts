import type { Connector } from "wagmi";
import { isMobileClient } from "./mobileClient";
import { saveWalletConnectDeepLinkChoice } from "./walletConnectMobileHandoff";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isTrust?: boolean;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const TRUST_UNIVERSAL_LINK = "https://link.trustwallet.com/wc";

export function isTrustWalletOption(name: string, connector?: Connector): boolean {
  const id = (connector?.id || "").toLowerCase();
  const rdns = ((connector as Connector & { rdns?: string }).rdns || "").toLowerCase();
  const lower = name.toLowerCase();
  return (
    id === "trust" ||
    rdns === "com.trustwallet.app" ||
    rdns === "io.trustwallet" ||
    lower.includes("trust wallet")
  );
}

export function findTrustInjectedProvider(windowObj: Window & { ethereum?: unknown; trustwallet?: { ethereum?: unknown } }): Eip1193Provider | undefined {
  const trustwallet = windowObj.trustwallet?.ethereum;
  if (trustwallet && typeof (trustwallet as Eip1193Provider).request === "function" && (trustwallet as Eip1193Provider).isTrust) {
    return trustwallet as Eip1193Provider;
  }

  const ethereum = windowObj.ethereum as (Eip1193Provider & { providers?: Eip1193Provider[] }) | undefined;
  if (!ethereum) return undefined;

  const candidates = Array.isArray(ethereum.providers) ? ethereum.providers : [ethereum];
  for (const provider of candidates) {
    if (provider?.isTrust && typeof provider.request === "function") return provider;
  }
  return undefined;
}

export async function trustInjectedProviderReady(connector?: Connector): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const injected = findTrustInjectedProvider(window);
  if (injected) return true;
  if (!connector) return false;
  try {
    const provider = (await connector.getProvider()) as Eip1193Provider | undefined;
    return Boolean(provider && typeof provider.request === "function" && provider.isTrust);
  } catch {
    return false;
  }
}

/** Opens Trust Wallet on mobile with a WalletConnect URI (phone browser / webview). */
export async function connectTrustViaWalletConnect(
  wcConnector: Connector,
  connectAsync: (args: { connector: Connector }) => Promise<unknown>,
): Promise<void> {
  const provider = (await wcConnector.getProvider()) as Eip1193Provider | undefined;
  if (!provider) {
    throw new Error("WalletConnect is not ready. Set VITE_WALLETCONNECT_PROJECT_ID and reload the page.");
  }

  let openedTrust = false;
  const onDisplayUri = (uri: unknown) => {
    if (typeof uri !== "string" || !uri.startsWith("wc:")) return;
    openedTrust = true;
    const deepLink = `${TRUST_UNIVERSAL_LINK}?uri=${encodeURIComponent(uri)}`;
    window.location.assign(deepLink);
  };

  saveWalletConnectDeepLinkChoice("Trust Wallet", TRUST_UNIVERSAL_LINK);

  provider.on?.("display_uri", onDisplayUri);
  try {
    await connectAsync({ connector: wcConnector });
  } finally {
    provider.removeListener?.("display_uri", onDisplayUri);
  }

  if (isMobileClient() && !openedTrust) {
    throw new Error(
      "Trust Wallet did not open. Install Trust Wallet, allow the browser to open apps, or open this site in Trust Wallet’s in-app browser.",
    );
  }
}
