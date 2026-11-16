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
  rpcUrls: { default: { http: ["https://ethereum-rpc.publicnode.com"] } },
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

export const appKit = walletConnectReady
  ? createAppKit({
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
    })
  : null;
