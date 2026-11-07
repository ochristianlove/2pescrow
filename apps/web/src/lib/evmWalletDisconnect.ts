import {
  disconnect,
  getAccount,
  getConnections,
  type Connector,
  type DisconnectParameters,
} from "@wagmi/core";
import { wagmiConfig } from "../wagmi";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** Wagmi calls connector.disconnect(); some injected / AppKit connectors omit it. */
export async function disconnectEvmWallet(parameters: DisconnectParameters = {}): Promise<void> {
  const connector = resolveDisconnectConnector(parameters);
  if (connector) patchConnectorDisconnect(connector);
  await disconnect(wagmiConfig, parameters);
}

function resolveDisconnectConnector(parameters: DisconnectParameters): Connector | undefined {
  if (parameters.connector) return parameters.connector;
  const { connections, current } = wagmiConfig.state;
  if (current) {
    const fromCurrent = connections.get(current)?.connector;
    if (fromCurrent) return fromCurrent;
  }
  return getAccount(wagmiConfig).connector ?? getConnections(wagmiConfig)[0]?.connector;
}

function patchConnectorDisconnect(connector: Connector): void {
  const typed = connector as Connector & { disconnect?: () => Promise<void> };
  const original = typed.disconnect;
  typed.disconnect = async () => {
    if (typeof original === "function") {
      try {
        await original.call(connector);
        return;
      } catch {
        /* fall through — still clear wagmi session below */
      }
    }
    await tryRevokeWalletPermissions(connector);
  };
}

async function tryRevokeWalletPermissions(connector: Connector): Promise<void> {
  const getProvider = connector.getProvider;
  if (typeof getProvider !== "function") return;
  try {
    const raw = await Promise.resolve(getProvider.call(connector));
    const provider = normalizeEip1193(raw);
    if (!provider) return;
    await provider.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    /* EIP-2255 optional; wagmi state clear is enough to reconnect */
  }
}

function normalizeEip1193(candidate: unknown): Eip1193Provider | undefined {
  if (candidate && typeof candidate === "object" && "provider" in candidate) {
    const nested = (candidate as { provider?: unknown }).provider;
    if (nested && typeof nested === "object" && typeof (nested as Eip1193Provider).request === "function") {
      candidate = nested;
    }
  }
  const provider = candidate as Eip1193Provider | undefined;
  if (provider?.request && typeof provider.request === "function") return provider;
  return undefined;
}
