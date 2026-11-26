import "@walletconnect/react-native-compat";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import { createAppKit, type AppKitNetwork, type Storage } from "@reown/appkit-react-native";
import { EthersAdapter } from "@reown/appkit-ethers-react-native";
import { safeJsonParse, safeJsonStringify } from "@walletconnect/safe-json";
import * as Clipboard from "expo-clipboard";
import { walletConnectProjectId } from "./config";

const projectId = walletConnectProjectId();

const ethereum: AppKitNetwork = {
  id: 1,
  name: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://eth.llamarpc.com"] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://etherscan.io" } },
  chainNamespace: "eip155",
  caipNetworkId: "eip155:1",
};

const storage: Storage = {
  getKeys: async () => [...(await AsyncStorage.getAllKeys())],
  getEntries: async <T,>() => {
    const keys = await AsyncStorage.getAllKeys();
    return Promise.all(
      keys.map(async (key) => [key, safeJsonParse((await AsyncStorage.getItem(key)) ?? "") as T] as [string, T]),
    );
  },
  setItem: async (key, value) => {
    await AsyncStorage.setItem(key, safeJsonStringify(value));
  },
  getItem: async <T,>(key: string) => {
    const item = await AsyncStorage.getItem(key);
    if (item == null) return undefined;
    return safeJsonParse(item) as T;
  },
  removeItem: async (key) => {
    await AsyncStorage.removeItem(key);
  },
};

export const walletConnectReady = Boolean(projectId);

const WALLETCONNECT_STORAGE_PREFIXES = ["wc@2:", "@appkit/", "@w3m/"];

type WalletConnectSessionShape = {
  topic?: string;
  expiry?: number;
  namespaces?: Record<string, { accounts?: string[]; chains?: string[] }>;
  peer?: {
    metadata?: {
      name?: string;
      redirect?: { native?: string; universal?: string };
    };
  };
};

type WalletConnectProviderShape = {
  session?: WalletConnectSessionShape;
  namespaces?: unknown;
  cleanupPendingPairings?: () => Promise<void>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  off?: (event: string, listener: (...args: unknown[]) => void) => void;
  client?: {
    ping?: (params: { topic: string }) => Promise<void>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    off?: (event: string, listener: (...args: unknown[]) => void) => void;
    core?: {
      relayer?: {
        connected?: boolean;
        restartTransport?: (relayUrl?: string) => Promise<void>;
      };
    };
    session?: {
      getAll?: () => WalletConnectSessionShape[];
      delete?: (topic: string, reason: { code: number; message: string }) => Promise<void>;
    };
    pairing?: {
      getAll?: () => { topic: string }[];
      delete?: (topic: string, reason: { code: number; message: string }) => Promise<void>;
    };
  };
};

type AppKitInternalShape = {
  disconnect: (namespace?: string, isInternal?: boolean) => Promise<void>;
  getProvider?: (namespace?: string) => WalletConnectProviderShape | null;
};

function getWalletConnectProvider(): WalletConnectProviderShape | null {
  if (!appKit) return null;
  try {
    const internal = appKit as unknown as AppKitInternalShape;
    return internal.getProvider?.("eip155") ?? internal.getProvider?.() ?? null;
  } catch {
    return null;
  }
}

const DEAD_SESSION_PATTERNS = [
  /no matching key/i,
  /session topic doesn't exist/i,
  /session.*does not exist/i,
  /session.*not found/i,
  /session.*expired/i,
  /session.*deleted/i,
  /session.*disconnected/i,
  /wallet.*not connected/i,
  /not connected/i,
  /invalid topic/i,
  /missing or invalid.*topic/i,
  /unauthorized.*method/i,
  /provider is not connected/i,
];

export function isDeadWalletSessionError(error: unknown): boolean {
  if (!error) return false;
  const parts: string[] = [];
  if (typeof error === "string") parts.push(error);
  else if (error instanceof Error) parts.push(error.message);
  else if (typeof error === "object") {
    const rec = error as { message?: unknown; shortMessage?: unknown; reason?: unknown; code?: unknown };
    if (typeof rec.message === "string") parts.push(rec.message);
    if (typeof rec.shortMessage === "string") parts.push(rec.shortMessage);
    if (typeof rec.reason === "string") parts.push(rec.reason);
    if (Number(rec.code) === 4900 || Number(rec.code) === 4901) return true;
  }
  const combined = parts.join(" ");
  return DEAD_SESSION_PATTERNS.some((pattern) => pattern.test(combined));
}

function withTimeout<T>(promise: Promise<T>, ms: number, tag: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(tag)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

let activeFastVerifyPromise: Promise<{ alive: boolean; reason?: string }> | null = null;
let activePingVerifyPromise: Promise<{ alive: boolean; reason?: string }> | null = null;

/**
 * Verifies that the persisted WalletConnect session is genuinely active and unexpired.
 * - Interactive transaction calls should pass `{ activePing: false }` for instant (<1ms) local
 *   expiry/topic/account verification (restarting the relayer only if actually disconnected).
 * - Background guards (`<WalletSessionGuard />`) pass `{ activePing: true }` without blocking UI taps.
 * Automatically clears stale state via disconnectWallet() if the session is dead.
 */
export function verifyWalletSession(options?: { activePing?: boolean; timeoutMs?: number }): Promise<{ alive: boolean; reason?: string }> {
  const shouldPing = options?.activePing === true;
  if (!shouldPing && activeFastVerifyPromise) return activeFastVerifyPromise;
  if (shouldPing && activePingVerifyPromise) return activePingVerifyPromise;

  const task = (async () => {
    const provider = getWalletConnectProvider();
    const session = provider?.session;
    const topic = session?.topic;

    if (!provider || !session || !topic) {
      await disconnectWallet();
      return { alive: false, reason: "Your wallet disconnected while inactive. Please reconnect your wallet and try again." };
    }

    if (typeof session.expiry === "number" && session.expiry * 1000 <= Date.now() + 5_000) {
      await disconnectWallet();
      return { alive: false, reason: "Your wallet session expired. Please reconnect your wallet and try again." };
    }

    const accounts = session.namespaces?.eip155?.accounts ?? [];
    if (accounts.length === 0) {
      await disconnectWallet();
      return { alive: false, reason: "Your wallet has no active Ethereum session. Please reconnect your wallet." };
    }

    const activeSessions = provider.client?.session?.getAll?.();
    if (Array.isArray(activeSessions) && !activeSessions.some((s) => s.topic === topic)) {
      await disconnectWallet();
      return { alive: false, reason: "Your wallet closed this connection. Please reconnect your wallet and try again." };
    }

    // Revive dropped WalletConnect relay transport after iOS/Android backgrounding or offline gaps
    // so any queued session_delete events from the wallet are received right away.
    const relayer = provider.client?.core?.relayer;
    if (relayer && relayer.connected === false && typeof relayer.restartTransport === "function") {
      try {
        await withTimeout(relayer.restartTransport(), shouldPing ? 3000 : 1200, "__RELAYER_TIMEOUT__");
        await new Promise((resolve) => setTimeout(resolve, shouldPing ? 250 : 100));
      } catch {
        // Continue to session re-check below.
      }
      const postRestartSessions = provider.client?.session?.getAll?.();
      if (!provider.session?.topic || (Array.isArray(postRestartSessions) && !postRestartSessions.some((s) => s.topic === topic))) {
        await disconnectWallet();
        return { alive: false, reason: "Your wallet disconnected while you were away. Please reconnect your wallet and try again." };
      }
    }

    if (shouldPing && typeof provider.client?.ping === "function") {
      try {
        await withTimeout(provider.client.ping({ topic }), options?.timeoutMs ?? 2500, "__PING_TIMEOUT__");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg !== "__PING_TIMEOUT__" && isDeadWalletSessionError(err)) {
          await disconnectWallet();
          return { alive: false, reason: "Your wallet disconnected while inactive. Please reconnect your wallet and try again." };
        }
        // Re-check whether the relay delivered a session_delete during the ping window.
        const postPingSessions = provider.client?.session?.getAll?.();
        if (!provider.session?.topic || (Array.isArray(postPingSessions) && !postPingSessions.some((s) => s.topic === topic))) {
          await disconnectWallet();
          return { alive: false, reason: "Your wallet disconnected while inactive. Please reconnect your wallet and try again." };
        }
      }
    }

    return { alive: true };
  })().finally(() => {
    if (shouldPing) activePingVerifyPromise = null;
    else activeFastVerifyPromise = null;
  });

  if (shouldPing) activePingVerifyPromise = task;
  else activeFastVerifyPromise = task;
  return task;
}

/**
 * Best-effort deep link to foreground the connected mobile wallet app right after dispatching
 * a WalletConnect signing request, preventing Android/iOS prompts from sitting unseen in background.
 */
export function openConnectedWalletApp(): void {
  const provider = getWalletConnectProvider();
  const redirect = provider?.session?.peer?.metadata?.redirect;
  const target = (redirect?.native || redirect?.universal || "").trim();
  if (!target) return;
  if (!/^(https?:\/\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(target)) return;
  void Linking.openURL(target).catch(() => undefined);
}

/**
 * Subscribes to WalletConnect session_delete / session_expire events on the active provider
 * so the UI clears its connected state the instant a wallet terminates the session.
 */
export function subscribeWalletSessionEvents(onDisconnected: () => void): () => void {
  const provider = getWalletConnectProvider();
  if (!provider) return () => {};
  const handler = () => {
    onDisconnected();
  };
  try {
    provider.on?.("session_delete", handler);
    provider.on?.("session_expire", handler);
    provider.on?.("disconnect", handler);
    provider.client?.on?.("session_delete", handler);
    provider.client?.on?.("session_expire", handler);
  } catch {
    // Ignore listener attachment errors.
  }
  return () => {
    try {
      provider.off?.("session_delete", handler);
      provider.off?.("session_expire", handler);
      provider.off?.("disconnect", handler);
      provider.client?.off?.("session_delete", handler);
      provider.client?.off?.("session_expire", handler);
    } catch {
      // Ignore cleanup errors.
    }
  };
}

export async function disconnectWallet(): Promise<void> {
  if (!appKit) return;

  // 1. Try polite WalletConnect disconnect with a short timeout so dead/stale iOS sockets never hang.
  try {
    await Promise.race([
      appKit.disconnect(),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Fall through to forced local teardown below.
  }

  // 2. Always force local AppKit state teardown (isInternal = false skips the network relay call).
  try {
    const internal = appKit as unknown as AppKitInternalShape;
    const provider = internal.getProvider?.("eip155") ?? internal.getProvider?.();
    if (provider) {
      const reason = { code: 6000, message: "User disconnected." };
      try {
        const sessions = provider.client?.session?.getAll?.() ?? [];
        for (const s of sessions) {
          if (s.topic) {
            await provider.client?.session?.delete?.(s.topic, reason).catch(() => undefined);
          }
        }
        const pairings = provider.client?.pairing?.getAll?.() ?? [];
        for (const p of pairings) {
          await provider.client?.pairing?.delete?.(p.topic, reason).catch(() => undefined);
        }
        await provider.cleanupPendingPairings?.().catch(() => undefined);
      } catch {
        // Ignore stale client cleanup errors.
      }
      provider.session = undefined;
      provider.namespaces = undefined;
    }
    await internal.disconnect("eip155", false);
  } catch {
    // Continue to storage cleanup.
  }

  // 3. Clear persisted WalletConnect / AppKit session keys so the stale connection cannot resurrect on restart.
  try {
    const keys = await AsyncStorage.getAllKeys();
    const staleKeys = keys.filter((key) =>
      WALLETCONNECT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    if (staleKeys.length > 0) {
      await AsyncStorage.multiRemove(staleKeys);
    }
  } catch {
    // Ignore storage cleanup errors.
  }
}

function initAppKit() {
  if (!walletConnectReady) return null;
  try {
    return createAppKit({
      projectId,
      networks: [ethereum],
      defaultNetwork: ethereum,
      adapters: [new EthersAdapter()],
      storage,
      themeMode: "dark",
      enableAnalytics: false,
      featuredWalletIds: [
        "c57ca95b47569778a828d19178114f2db125b25b778adf5cba72bd778e231769",
      ],
      features: {
        swaps: false,
        onramp: false,
        socials: [],
        showWallets: true,
      },
      metadata: {
        name: "2Pescrow",
        description: "Buyer-funded P2P escrow on Ethereum",
        url: "https://2pescrow.com",
        icons: ["https://2pescrow.com/brand/favicon.png"],
        redirect: {
          native: "twopescrow://",
          universal: "https://2pescrow.com",
        },
      },
      clipboardClient: {
        setString: async (value: string) => {
          await Clipboard.setStringAsync(value);
        },
      },
    });
  } catch (err) {
    console.warn("[AppKit] Initialization failed, continuing without WalletConnect:", err);
    return null;
  }
}

export const appKit = initAppKit();
