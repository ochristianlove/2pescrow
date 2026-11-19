import { http, createConfig } from "wagmi";
import { baseAccount, injected, walletConnect } from "wagmi/connectors";
import { mainnet } from "viem/chains";

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() ||
  "99700e35ab779a3fdd3918084d55bd02";
export const walletConnectProjectId = projectId;
export const walletConnectConfigured = Boolean(projectId);

const walletConnectMetadata = {
  name: "2Pescrow",
  description: "Buyer-funded P2P escrow on Ethereum",
  url: "https://2pescrow.com",
  icons: ["https://2pescrow.com/brand/favicon.png"],
};

export const wagmiConfig = createConfig({
  chains: [mainnet],
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected({ target: "metaMask" }),
    injected({ target: "rabby" }),
    injected({ target: "okxWallet" }),
    injected({
      target: {
        id: "trust",
        name: "Trust Wallet",
        provider(window) {
          const w = window as Window & {
            ethereum?: { isTrust?: boolean; request?: unknown; providers?: { isTrust?: boolean; request?: unknown }[] };
            trustwallet?: { ethereum?: { isTrust?: boolean; request?: unknown } };
          };
          const fromTrust = w.trustwallet?.ethereum;
          if (fromTrust && typeof fromTrust.request === "function" && fromTrust.isTrust) return fromTrust;
          const eth = w.ethereum;
          if (!eth) return undefined;
          const list = Array.isArray(eth.providers) ? eth.providers : [eth];
          return list.find((p) => p?.isTrust && typeof p.request === "function");
        },
      },
    }),
    injected({ target: "phantom" }),
    injected({ target: "braveWallet" }),
    injected({ target: "rainbow" }),
    injected({ target: "zerion" }),
    injected({ target: "frame" }),
    injected({ target: "tokenPocket" }),
    injected({ target: "bitKeep" }),
    injected({ target: "imToken" }),
    injected({ target: "backpack" }),
    injected({ target: "enkrypt" }),
    baseAccount({ appName: "2Pescrow" }),
    ...(projectId
      ? [
          walletConnect({
            projectId,
            showQrModal: true,
            metadata: walletConnectMetadata,
            qrModalOptions: {
              enableExplorer: true,
              explorerRecommendedWalletIds: [
                "c57ca95b47569778a828d19178114f2db125b25b778adf5cba72bd778e231769",
                "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
                "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
                "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
              ],
            },
          }),
        ]
      : []),
  ],
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com"),
  },
});
