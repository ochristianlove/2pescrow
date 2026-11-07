import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BitKeepAdapter, OkxWalletAdapter, TokenPocketAdapter, TronLinkAdapter } from "@tronweb3/tronwallet-adapters";
import { WalletReadyState, type Adapter as TronAdapter } from "@tronweb3/tronwallet-abstract-adapter";
import { WalletConnectAdapter } from "@tronweb3/tronwallet-adapter-walletconnect";
import { TronWeb } from "tronweb";
import { api } from "../api";
import { usePlatformSettings } from "../platformSettings";
import { walletConnectProjectId } from "../../wagmi";
import type { WalletConfig } from "../types";
import { fetchTrc20Balance, isTronBase58Address, type TronWalletSigner } from "./tronLink";
import type { TronWebLike } from "./types";

type TronWalletOption = { name: string; icon: string; url: string };

type TronCtx = {
  enabled: boolean;
  address: string | null;
  tronWeb: TronWebLike | null;
  signer: TronWalletSigner | null;
  usdtBalanceAtomic: bigint | null;
  usdtTokenAddress: string | null;
  walletName: string | null;
  walletOptions: TronWalletOption[];
  connecting: boolean;
  pickerOpen: boolean;
  error: string | null;
  connectFailureReason: "not_detected" | "timeout" | "rejected" | "no_account" | "reload_required" | "wrong_network" | null;
  connect: () => Promise<void>;
  connectWallet: (name: string) => Promise<void>;
  closePicker: () => void;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
};

const TronWalletContext = createContext<TronCtx>({
  enabled: false,
  address: null,
  tronWeb: null,
  signer: null,
  usdtBalanceAtomic: null,
  usdtTokenAddress: null,
  walletName: null,
  walletOptions: [],
  connecting: false,
  pickerOpen: false,
  error: null,
  connectFailureReason: null,
  connect: async () => undefined,
  connectWallet: async () => undefined,
  closePicker: () => undefined,
  disconnect: () => undefined,
  refreshBalance: async () => undefined,
});

const tronRpcUrl = import.meta.env.VITE_TRON_RPC_URL?.trim() || "https://api.trongrid.io";
const configuredTronNetwork = import.meta.env.VITE_TRON_NETWORK?.trim().toLowerCase();
// WalletConnect's TRON adapter maps these case-sensitive names to CAIP chain IDs.
export const tronNetworkName = configuredTronNetwork === "shasta" || (!configuredTronNetwork && /shasta/i.test(tronRpcUrl))
  ? "Shasta"
  : configuredTronNetwork === "nile" || (!configuredTronNetwork && /nile/i.test(tronRpcUrl))
    ? "Nile"
    : "Mainnet";

type WalletAdapter = Omit<TronAdapter, "signTransaction"> & { signTransaction: (transaction: unknown) => Promise<unknown> };
type NetworkAwareWalletAdapter = WalletAdapter & {
  network?: () => Promise<{ networkType: string }>;
};

function createWalletAdapters(): WalletAdapter[] {
  const adapters: TronAdapter[] = [
    new TronLinkAdapter(),
    new TokenPocketAdapter(),
    new BitKeepAdapter(),
    new OkxWalletAdapter(),
  ];
  if (walletConnectProjectId) {
    const origin = typeof window === "undefined" ? "https://2pescrow.com" : window.location.origin;
    adapters.push(new WalletConnectAdapter({
      network: tronNetworkName,
      options: {
        projectId: walletConnectProjectId,
        metadata: {
          name: "2Pescrow",
          description: "TRON USDT escrow",
          url: origin,
          icons: [`${origin}/favicon.ico`],
        },
      },
      themeMode: "dark",
      allWallets: "SHOW",
      themeVariables: { "--w3m-z-index": 1000 },
    }));
  }
  return adapters as WalletAdapter[];
}

const TRON_WALLET_KEY = "2pescrow_tron_wallet";

function rememberedWalletConnectSession() {
  try {
    return Object.keys(localStorage).some((key) => key.startsWith("wc@2:"));
  } catch {
    return false;
  }
}

export function TronWalletProvider({ children }: { children: ReactNode }) {
  const { settings, loading: settingsLoading } = usePlatformSettings();
  const enabled = !!settings?.tronSupportEnabled;
  const adapters = useMemo(createWalletAdapters, []);
  const [adapterReadinessRevision, setAdapterReadinessRevision] = useState(0);
  const activeAdapterRef = useRef<WalletAdapter | null>(null);
  const [activeAdapter, setActiveAdapter] = useState<WalletAdapter | null>(null);
  const [tronWeb, setTronWeb] = useState<TronWebLike | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [walletName, setWalletName] = useState<string | null>(null);
  const [usdtBalanceAtomic, setUsdtBalanceAtomic] = useState<bigint | null>(null);
  const [usdtTokenAddress, setUsdtTokenAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectFailureReason, setConnectFailureReason] = useState<TronCtx["connectFailureReason"]>(null);

  useEffect(() => {
    const refreshAdapterReadiness = () => setAdapterReadinessRevision((revision) => revision + 1);
    for (const adapter of adapters) adapter.on("readyStateChanged", refreshAdapterReadiness);
    return () => {
      for (const adapter of adapters) adapter.off("readyStateChanged", refreshAdapterReadiness);
    };
  }, [adapters]);

  const clearAppConnection = useCallback((adapter?: WalletAdapter) => {
    if (adapter && activeAdapterRef.current && activeAdapterRef.current !== adapter) return;
    activeAdapterRef.current = null;
    try { localStorage.removeItem(TRON_WALLET_KEY); } catch { /* storage unavailable */ }
    setActiveAdapter(null);
    setAddress(null);
    setWalletName(null);
    setTronWeb(null);
    setUsdtBalanceAtomic(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromSettings = settings?.tronUsdtAddress?.trim();
      if (fromSettings) {
        setUsdtTokenAddress(fromSettings);
        return;
      }
      try {
        const cfg = await api<WalletConfig>("/v1/config/wallets");
        if (!cancelled) setUsdtTokenAddress(cfg.tokens.TRON_USDT?.trim() || null);
      } catch {
        if (!cancelled) setUsdtTokenAddress(null);
      }
    })();
    return () => { cancelled = true; };
  }, [settings?.tronUsdtAddress]);

  const setConnectedAdapter = useCallback(async (adapter: WalletAdapter, nextAddress: string) => {
    if (!isTronBase58Address(nextAddress)) throw new Error("The selected wallet returned an invalid TRON address");
    if (String(adapter.name) !== "WalletConnect") {
      const network = await (adapter as NetworkAwareWalletAdapter).network?.();
      if (!network?.networkType || network.networkType.toLowerCase() !== tronNetworkName.toLowerCase()) {
        throw new Error(`This wallet is connected to ${network?.networkType || "an unverified network"}. Switch it to TRON ${tronNetworkName} and connect again.`);
      }
    }
    activeAdapterRef.current = adapter;
    try { localStorage.setItem(TRON_WALLET_KEY, String(adapter.name)); } catch { /* storage unavailable */ }
    const client = new TronWeb({ fullHost: tronRpcUrl });
    client.setAddress(nextAddress);
    setActiveAdapter(adapter);
    setAddress(nextAddress);
    setWalletName(String(adapter.name));
    setTronWeb(client as unknown as TronWebLike);
    setError(null);
    setConnectFailureReason(null);
  }, []);

  const disconnect = useCallback(() => {
    if (activeAdapter) void activeAdapter.disconnect().catch(() => undefined);
    try { localStorage.removeItem(TRON_WALLET_KEY); } catch { /* storage unavailable */ }
    activeAdapterRef.current = null;
    setActiveAdapter(null);
    setAddress(null);
    setWalletName(null);
    setTronWeb(null);
    setUsdtBalanceAtomic(null);
    setError(null);
    setConnectFailureReason(null);
  }, [activeAdapter]);

  const watchedAdapters = useRef(new Set<WalletAdapter>());
  const watchAdapter = useCallback((adapter: WalletAdapter) => {
    if (watchedAdapters.current.has(adapter)) return;
    watchedAdapters.current.add(adapter);
    adapter.on("accountsChanged", (next: string) => {
      void setConnectedAdapter(adapter, next).catch((e) => {
        clearAppConnection(adapter);
        setError(e instanceof Error ? e.message : String(e));
        setConnectFailureReason("wrong_network");
      });
    });
    adapter.on("chainChanged", () => {
      const currentAddress = adapter.address;
      if (!currentAddress) return;
      void setConnectedAdapter(adapter, currentAddress).catch((e) => {
        clearAppConnection(adapter);
        setError(e instanceof Error ? e.message : String(e));
        setConnectFailureReason("wrong_network");
      });
    });
    adapter.on("disconnect", () => {
      if (activeAdapterRef.current === adapter) clearAppConnection(adapter);
    });
  }, [clearAppConnection, setConnectedAdapter]);

  const closePicker = useCallback(() => setPickerOpen(false), []);
  const connect = useCallback(async () => {
    if (!enabled) return;
    setError(null);
    setConnectFailureReason(null);
    setPickerOpen(true);
  }, [enabled]);

  const connectWallet = useCallback(async (name: string) => {
    if (!enabled || connecting) return;
    const adapter = adapters.find((item) => String(item.name) === name);
    if (!adapter) {
      setError("That TRON wallet option is not available. Refresh the page and try again.");
      return;
    }
    setConnecting(true);
    setError(null);
    setConnectFailureReason(null);
    try {
      if (activeAdapter && activeAdapter !== adapter) {
        await activeAdapter.disconnect().catch(() => undefined);
      }
      await adapter.connect();
      const nextAddress = adapter.address;
      if (!nextAddress) throw new Error(`${String(adapter.name)} connected without returning an address`);
      watchAdapter(adapter);
      await setConnectedAdapter(adapter, nextAddress);
      setPickerOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not connect to that TRON wallet.";
      setError(message);
      const lower = message.toLowerCase();
      setConnectFailureReason(lower.includes("reject") || lower.includes("cancel") ? "rejected" : lower.includes("network") ? "wrong_network" : "not_detected");
    } finally {
      setConnecting(false);
    }
  }, [activeAdapter, adapters, connecting, enabled, setConnectedAdapter, watchAdapter]);

  const refreshBalance = useCallback(async () => {
    if (!tronWeb || !address || !usdtTokenAddress) {
      setUsdtBalanceAtomic(null);
      return;
    }
    try {
      setUsdtBalanceAtomic(await fetchTrc20Balance(tronWeb, usdtTokenAddress, address));
      setError(null);
    } catch (e) {
      setUsdtBalanceAtomic(null);
      setError(e instanceof Error ? e.message : "Could not read TRC-20 balance");
    }
  }, [tronWeb, address, usdtTokenAddress]);

  useEffect(() => {
    if (address && tronWeb && usdtTokenAddress) void refreshBalance();
  }, [address, tronWeb, usdtTokenAddress, refreshBalance]);

  useEffect(() => {
    if (settingsLoading || enabled || !activeAdapter) return;
    disconnect();
  }, [settingsLoading, enabled, activeAdapter, disconnect]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const adopt = (adapter: WalletAdapter, nextAddress?: string | null) => {
      const next = nextAddress || adapter.address;
      if (cancelled || !next || activeAdapterRef.current) return;
      watchAdapter(adapter);
      void setConnectedAdapter(adapter, next).catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setConnectFailureReason("wrong_network");
      });
    };
    const subscriptions = adapters.map((adapter) => {
      const onConnect = (next: string) => adopt(adapter, next);
      adapter.on("connect", onConnect);
      if (adapter.connected && adapter.address) adopt(adapter, adapter.address);
      return { adapter, onConnect };
    });
    let saved = "";
    try { saved = localStorage.getItem(TRON_WALLET_KEY) || ""; } catch { saved = ""; }
    if (saved === "WalletConnect" && rememberedWalletConnectSession()) {
      const walletConnect = adapters.find((adapter) => String(adapter.name) === "WalletConnect");
      if (walletConnect && !walletConnect.connected) void walletConnect.connect().catch(() => undefined);
    }
    return () => {
      cancelled = true;
      for (const { adapter, onConnect } of subscriptions) adapter.off("connect", onConnect);
    };
  }, [adapters, enabled, setConnectedAdapter, watchAdapter]);

  const walletOptions = useMemo(() => adapters
    .filter((adapter) => String(adapter.name) === "WalletConnect" || adapter.connected || adapter.readyState === WalletReadyState.Found)
    .map((adapter) => ({
      name: String(adapter.name),
      icon: adapter.icon,
      url: adapter.url,
    })), [adapters, adapterReadinessRevision]);

  return (
    <TronWalletContext.Provider value={{
      enabled,
      address,
      tronWeb,
      signer: activeAdapter,
      usdtBalanceAtomic,
      usdtTokenAddress,
      walletName,
      walletOptions,
      connecting,
      pickerOpen,
      error,
      connectFailureReason,
      connect,
      connectWallet,
      closePicker,
      disconnect,
      refreshBalance,
    }}>
      {children}
      {enabled && pickerOpen && (
        <div className="wallet-picker-backdrop" role="presentation" onClick={closePicker}>
          <div className="wallet-picker-modal card-surface" role="dialog" aria-modal="true" aria-labelledby="tron-wallet-picker-title" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-picker-head">
              <div>
                <h2 id="tron-wallet-picker-title">Connect a TRON wallet</h2>
                <p className="muted">Choose a wallet holding TRC-20 USDT. It will sign transactions directly; 2Pescrow never receives your keys.</p>
              </div>
              <button type="button" className="secondary wallet-picker-close" onClick={closePicker} aria-label="Close">×</button>
            </div>
            {error && <p className="error-banner" role="alert">{error}</p>}
            {connecting && <p className="wallet-approval-hint" role="status">Approve the connection in your wallet, then return to this page.</p>}
            <div className="wallet-picker-list">
              {walletOptions.map((wallet) => (
                <button key={wallet.name} type="button" className="wallet-picker-option" disabled={connecting} onClick={() => void connectWallet(wallet.name)}>
                  <img src={wallet.icon} alt="" className="wallet-picker-icon" width={32} height={32} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  <span className="wallet-picker-label"><strong>{wallet.name}</strong><span className="muted wallet-picker-sub">Connect and sign TRON transactions</span></span>
                  {connecting && <span className="wallet-picker-busy">Connecting…</span>}
                </button>
              ))}
              {walletOptions.length === 0 && <p className="muted wallet-picker-empty">No TRON wallet extension found. Install a supported wallet, or configure WalletConnect for mobile pairing.</p>}
              {!walletConnectProjectId && <p className="hint">WalletConnect is not configured for this build. Use a supported wallet app browser or configure VITE_WALLETCONNECT_PROJECT_ID to enable mobile pairing.</p>}
            </div>
            <p className="wallet-picker-agreement">
              By connecting, you agree to our{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </p>
            <p className="hint wallet-picker-foot">You may need TRX or available network resources to pay TRON transaction costs.</p>
          </div>
        </div>
      )}
    </TronWalletContext.Provider>
  );
}

export function useTronWallet() {
  return useContext(TronWalletContext);
}
