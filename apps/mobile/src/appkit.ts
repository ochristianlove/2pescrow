import "@walletconnect/react-native-compat";

import AsyncStorage from "@react-native-async-storage/async-storage";
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
    const internal = appKit as unknown as {
      disconnect: (namespace?: string, isInternal?: boolean) => Promise<void>;
      getProvider?: (namespace?: string) => {
        session?: unknown;
        namespaces?: unknown;
        cleanupPendingPairings?: () => Promise<void>;
        client?: {
          session?: { getAll?: () => { topic: string }[]; delete?: (topic: string, reason: { code: number; message: string }) => Promise<void> };
          pairing?: { getAll?: () => { topic: string }[]; delete?: (topic: string, reason: { code: number; message: string }) => Promise<void> };
        };
      } | null;
    };
    const provider = internal.getProvider?.("eip155") ?? internal.getProvider?.();
    if (provider) {
      const reason = { code: 6000, message: "User disconnected." };
      try {
        const sessions = provider.client?.session?.getAll?.() ?? [];
        for (const s of sessions) {
          await provider.client?.session?.delete?.(s.topic, reason).catch(() => undefined);
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
