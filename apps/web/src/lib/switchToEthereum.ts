import type { Connector } from "wagmi";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const ETHEREUM_HEX = "0x1";

/** Wallet networks that are not Ethereum mainnet but may still be selected in the user's wallet. */
const LEGACY_CHAINS: Record<number, string> = {
  534351: "Unsupported test network",
  534352: "Unsupported network",
};

export function describeWalletChain(chainId?: number) {
  if (chainId == null || Number.isNaN(chainId)) return "an unknown network";
  const legacy = LEGACY_CHAINS[chainId];
  if (legacy) return `${legacy} (chain ${chainId})`;
  if (chainId === 1) return "Ethereum (chain 1)";
  return `chain ${chainId}`;
}

function rpcCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

async function providerFor(connector: Connector | undefined) {
  const provider = (await connector?.getProvider?.()) as Eip1193 | undefined;
  if (!provider?.request) {
    throw new Error("Open your wallet and choose the Ethereum network, then come back to this page.");
  }
  return provider;
}

async function readChainId(provider: Eip1193) {
  return Number(await provider.request({ method: "eth_chainId" }));
}

async function waitForChain(provider: Eip1193, expected: number) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const chainId = await readChainId(provider);
    if (chainId === expected) return chainId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return readChainId(provider);
}

/** Ask the connected wallet to leave its current network and select Ethereum mainnet. */
export async function requestSwitchToEthereum(connector: Connector | undefined) {
  const provider = await providerFor(connector);
  const before = await readChainId(provider);
  if (before === 1) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ETHEREUM_HEX }],
    });
  } catch (error) {
    const code = rpcCode(error);
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: ETHEREUM_HEX,
            chainName: "Ethereum",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://ethereum-rpc.publicnode.com"],
            blockExplorerUrls: ["https://etherscan.io"],
          },
        ],
      });
    } else if (code === 4001) {
      throw new Error("The wallet declined the switch. Choose Ethereum in the wallet, then try again.");
    } else if (code === -32002) {
      throw new Error("A network switch is already waiting in your wallet. Approve it there.");
    } else {
      const detail = error instanceof Error ? error.message : "The wallet did not switch.";
      throw new Error(`${detail} Your wallet is still on ${describeWalletChain(before)}.`);
    }
  }

  const after = await waitForChain(provider, 1);
  if (after !== 1) {
    throw new Error(`Your wallet is still on ${describeWalletChain(after)}. Open the wallet and select Ethereum.`);
  }
}
