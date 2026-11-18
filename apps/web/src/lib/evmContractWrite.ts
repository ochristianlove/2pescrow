import { getAccount, getConnections } from "@wagmi/core";
import type { Connector } from "wagmi";
import {
  getAddress,
  type Abi,
  type Address,
  type Hash,
  type WriteContractParameters,
} from "viem";
import { mainnet } from "viem/chains";
import { wagmiConfig } from "../wagmi";
import { withMobileWalletConnectHandoff } from "./walletConnectMobileHandoff";
import { normalizeEvmFundingError } from "./evmWalletErrors";
import { sendMainnetContractTransaction } from "./ethereumTransaction";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const PROVIDER_TIMEOUT_MS = 12_000;
const SEND_TIMEOUT_MS = 120_000;

/** Contract write with mobile WalletConnect deep-link handoff before signing. */
export async function writeContractViaConnector(
  connector: Connector | undefined,
  account: Address | undefined,
  parameters: Omit<WriteContractParameters<Abi, string, unknown[], typeof mainnet>, "account" | "chain">,
): Promise<Hash> {
  return withMobileWalletConnectHandoff(connector, () => writeViaConnector(connector, account, parameters));
}

/** Wallet writes without wagmi's connector.getChainId() (some providers expose getChainId as a non-function). */
export async function writeViaConnector(
  connector: Connector | undefined,
  account: Address | undefined,
  parameters: Omit<WriteContractParameters<Abi, string, unknown[], typeof mainnet>, "account" | "chain">,
): Promise<Hash> {
  const signer = account ? getAddress(account) : undefined;
  if (!signer) {
    throw new Error("Connect your Ethereum wallet on Ethereum mainnet, then try again.");
  }

  const provider = await resolveSigningProvider(connector, signer);
  await ensureWalletAccount(provider, signer);

  try {
    return await withTimeout(
      sendMainnetContractTransaction(provider, signer, parameters),
      SEND_TIMEOUT_MS,
      "The wallet has not returned a transaction result. Check its activity before trying again; the request may still be pending.",
    );
  } catch (error) {
    throw new Error(normalizeEvmFundingError(error, {}));
  }
}

async function resolveSigningProvider(connector: Connector | undefined, account: Address): Promise<Eip1193Provider> {
  const candidates: Eip1193Provider[] = [];

  for (const c of connectorsToTry(connector)) {
    const fromConnector = await providerFromConnector(c);
    if (fromConnector) candidates.push(fromConnector);
  }

  for (const injected of listInjectedProviders()) {
    if (!candidates.includes(injected)) candidates.push(injected);
  }

  const lower = account.toLowerCase();
  for (const provider of candidates) {
    try {
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      if (accounts.some((a) => a.toLowerCase() === lower)) {
        return bindProvider(provider);
      }
    } catch {
      /* try next provider */
    }
  }

  const fallback = candidates[0] ?? listInjectedProviders()[0];
  if (fallback) return bindProvider(fallback);

  throw new Error("No Ethereum wallet is available in this browser. Reconnect on Ethereum mainnet.");
}

function connectorsToTry(preferred?: Connector): Connector[] {
  const out: Connector[] = [];
  const push = (c?: Connector) => {
    if (!c || out.some((x) => x.id === c.id && x.name === c.name)) return;
    out.push(c);
  };
  push(preferred);
  push(getAccount(wagmiConfig).connector);
  for (const { connector } of getConnections(wagmiConfig)) push(connector);
  return out;
}

async function providerFromConnector(connector: Connector): Promise<Eip1193Provider | undefined> {
  const getProvider = connector.getProvider;
  if (typeof getProvider !== "function") return undefined;
  try {
    const raw = await withTimeout(
      Promise.resolve(getProvider.call(connector)),
      PROVIDER_TIMEOUT_MS,
      "Wallet provider timeout",
    );
    return normalizeEip1193(raw);
  } catch {
    return undefined;
  }
}

function normalizeEip1193(candidate: unknown): Eip1193Provider | undefined {
  if (typeof candidate === "function") {
    return undefined;
  }

  if (candidate && typeof candidate === "object" && "provider" in candidate) {
    const nested = (candidate as { provider?: unknown }).provider;
    if (nested && typeof nested === "object" && typeof (nested as Eip1193Provider).request === "function") {
      candidate = nested;
    }
  }

  if (Array.isArray(candidate)) {
    candidate =
      candidate.find((entry) => entry && typeof entry === "object" && typeof (entry as Eip1193Provider).request === "function")
      ?? candidate[0];
  }

  const provider = candidate as Eip1193Provider | undefined;
  if (provider?.request && typeof provider.request === "function") return provider;
  return undefined;
}

function listInjectedProviders(): Eip1193Provider[] {
  if (typeof window === "undefined") return [];
  const win = window as Window & { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } };
  const eth = win.ethereum;
  if (!eth) return [];
  const out: Eip1193Provider[] = [];
  if (Array.isArray(eth.providers)) {
    for (const p of eth.providers) {
      if (p && typeof p.request === "function") out.push(p);
    }
  }
  if (typeof eth.request === "function" && !out.includes(eth)) out.push(eth);
  return out;
}

function bindProvider(provider: Eip1193Provider): Eip1193Provider {
  return {
    request: (args) => provider.request(args),
  };
}

async function ensureWalletAccount(provider: Eip1193Provider, account: Address) {
  const lower = account.toLowerCase();
  const existing = (await provider.request({ method: "eth_accounts" })) as string[];
  if (existing.some((a) => a.toLowerCase() === lower)) return;
  const requested = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!requested.some((a) => a.toLowerCase() === lower)) {
    throw new Error("Connect the wallet linked to this trade on Ethereum mainnet.");
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
