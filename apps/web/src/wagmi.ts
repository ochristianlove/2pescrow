import { http, createConfig } from "wagmi";
import { baseAccount, injected, walletConnect } from "wagmi/connectors";
import { mainnet } from "viem/chains";

const localTestProjectId = import.meta.env.DEV && typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "b56e18d47c72ab683b10814fe9495694"
  : "";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim() || localTestProjectId;
export const walletConnectProjectId = projectId;
export const walletConnectConfigured = Boolean(projectId);

const dappOrigin =
  typeof window !== "undefined" ? window.location.origin : "https://2pescrow.com";

const walletConnectMetadata = {
  name: "2Pescrow",
  description: "Buyer-funded P2P escrow on Ethereum",
  url: dappOrigin,
  icons: [`${dappOrigin}/favicon.ico`],
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
                "4622a2cb2a569f3da8ca4cc045b9c25f4a56945b",
                "c57ca95a4757518a8676d5b496a380d5201d169",
                "fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa",
                "1ae92b26df02f80511c108d6cb6d4100b7c601c0027150b5a0bb5dc408e2748",
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
