import type { Connector } from "wagmi";
import { isMobileClient } from "./mobileClient";
import { isWalletConnectConnector } from "./walletConnectorMeta";

/** Same key as Reown AppKit (`SafeLocalStorageKeys.DEEPLINK_CHOICE`). */
export const WALLETCONNECT_DEEPLINK_STORAGE_KEY = "WALLETCONNECT_DEEPLINK_CHOICE";

type DeepLinkChoice = { name: string; href: string };

type WcSessionPeer = {
  metadata?: {
    name?: string;
    redirect?: { native?: string; universal?: string };
  };
};

type WcEthereumProvider = {
  session?: { peer?: WcSessionPeer };
  signer?: {
    session?: { peer?: WcSessionPeer };
    client?: WcSignClient;
  };
};

type WcSignClient = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
};

/** Fallback universal / native bases when session metadata has no redirect. */
const WALLET_OPEN_BASE_BY_NAME: [string, string][] = [
  ["trust", "https://link.trustwallet.com/wc"],
  ["metamask", "https://metamask.app.link/wc"],
  ["rainbow", "https://rnbwapp.com/wc"],
  ["coinbase", "https://go.cb-w.com/wc"],
  ["okx", "https://www.okx.com/download/wc"],
  ["zerion", "https://wallet.zerion.io/wc"],
  ["tokenpocket", "https://link.tokenpocket.pro/wc"],
  ["imtoken", "https://link.imtoken.com/wc"],
  ["bitget", "https://web3.bitget.com/wc"],
  ["phantom", "https://phantom.app/wc"],
];

export function saveWalletConnectDeepLinkChoice(name: string, href: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WALLETCONNECT_DEEPLINK_STORAGE_KEY, JSON.stringify({ name, href }));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getWalletConnectDeepLinkChoice(): DeepLinkChoice | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(WALLETCONNECT_DEEPLINK_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as DeepLinkChoice;
    if (parsed?.href && parsed?.name) return parsed;
  } catch {
    /* ignore */
  }
  return undefined;
}

function normalizeOpenUrl(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("wc?uri=")) return trimmed;
  if (/\/wc\/?$/.test(trimmed)) return trimmed.replace(/\/?$/, "");
  if (trimmed.endsWith("/wc")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return `${trimmed.replace(/\/+$/, "")}/wc`;
  }
  if (trimmed.includes("://")) {
    const base = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
    return `${base}wc`;
  }
  return trimmed;
}

function hrefFromPeerMetadata(peer?: WcSessionPeer): string | undefined {
  const redirect = peer?.metadata?.redirect;
  if (redirect?.universal) return redirect.universal;
  if (redirect?.native) return redirect.native;
  const name = (peer?.metadata?.name || "").toLowerCase();
  for (const [hint, url] of WALLET_OPEN_BASE_BY_NAME) {
    if (name.includes(hint)) return url;
  }
  return undefined;
}

export async function resolveMobileWalletOpenUrl(connector?: Connector): Promise<string | undefined> {
  const stored = getWalletConnectDeepLinkChoice()?.href;
  if (stored) return normalizeOpenUrl(stored);

  if (!connector) return undefined;
  try {
    const provider = (await connector.getProvider()) as WcEthereumProvider | undefined;
    const peer = provider?.session?.peer ?? provider?.signer?.session?.peer;
    const fromPeer = hrefFromPeerMetadata(peer);
    if (fromPeer) return normalizeOpenUrl(fromPeer);
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Opens the paired mobile wallet so a pending WalletConnect session request can be signed. */
export function openMobileWalletForSigning(openUrl: string): void {
  if (typeof window === "undefined" || !openUrl) return;
  const target = normalizeOpenUrl(openUrl);
  try {
    window.location.assign(target);
  } catch {
    window.open(target, "_blank", "noreferrer noopener");
  }
}

async function getWalletConnectSignClient(connector: Connector): Promise<WcSignClient | undefined> {
  const provider = (await connector.getProvider()) as WcEthereumProvider | undefined;
  return provider?.signer?.client;
}

export async function persistWalletConnectDeepLinkFromConnector(connector: Connector): Promise<void> {
  if (!isWalletConnectConnector(connector)) return;
  const stored = getWalletConnectDeepLinkChoice();
  if (stored?.href) return;

  const provider = (await connector.getProvider()) as WcEthereumProvider | undefined;
  const peer = provider?.session?.peer ?? provider?.signer?.session?.peer;
  const href = hrefFromPeerMetadata(peer);
  const name = peer?.metadata?.name || "WalletConnect";
  if (href) saveWalletConnectDeepLinkChoice(name, href);
}

const SIGNING_RPC_METHODS = new Set([
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "wallet_sendCalls",
]);

/**
 * On mobile WalletConnect, deep-link to the wallet when a session sign request is sent
 * (approve USDT, deposit, etc.), matching connect-time handoff behavior.
 */
export async function withMobileWalletConnectHandoff<T>(
  connector: Connector | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isMobileClient() || !connector || !isWalletConnectConnector(connector)) {
    return fn();
  }

  const openUrl = await resolveMobileWalletOpenUrl(connector);
  const signClient = await getWalletConnectSignClient(connector);

  const onSessionRequestSent = () => {
    if (openUrl) openMobileWalletForSigning(openUrl);
  };

  signClient?.on("session_request_sent", onSessionRequestSent);

  try {
    const resultPromise = fn();
    if (openUrl) {
      // Open wallet immediately (user gesture) and again when the relay emits the request.
      openMobileWalletForSigning(openUrl);
      const backupTimer = window.setTimeout(() => openMobileWalletForSigning(openUrl), 400);
      try {
        return await resultPromise;
      } finally {
        window.clearTimeout(backupTimer);
      }
    }
    return await resultPromise;
  } finally {
    signClient?.off("session_request_sent", onSessionRequestSent);
  }
}

export function isWalletConnectSigningMethod(method: string): boolean {
  return SIGNING_RPC_METHODS.has(method);
}
