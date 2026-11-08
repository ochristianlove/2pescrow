import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useConnect, useConnectors } from "wagmi";
import { useEvmDisconnect } from "./useEvmDisconnect";
import { injected } from "wagmi/connectors";
import { mainnet } from "viem/chains";
import { walletConnectConfigured } from "../wagmi";
import type { Connector } from "wagmi";
import {
  connectorToPickerOption,
  dedupePickerOptions,
  fallbackInitial,
  isBaseFallbackConnector,
  isWalletConnectConnector,
  resolveWalletOptionIcon,
  resolveWalletPickerOptions,
  type WalletPickerOption,
} from "./walletConnectorMeta";
import { shortAddr } from "./api";
import { requestSwitchToEthereum } from "./switchToEthereum";
import { isMobileClient } from "./mobileClient";
import {
  normalizeWalletConnectConnectError,
  walletConnectPendingHint,
} from "./walletConnectModalConnect";
import { persistWalletConnectDeepLinkFromConnector } from "./walletConnectMobileHandoff";

export function walletConnectCancelledMessage(): string {
  return isMobileClient()
    ? "Connection was cancelled. Tap WalletConnect again and approve in your wallet app."
    : "Connection was cancelled. Please try again and scan the QR code with your mobile wallet.";
}

export const WALLETCONNECT_CANCELLED_MESSAGE = walletConnectCancelledMessage();

function isWalletConnectCancelError(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    m.includes("user rejected") ||
    m.includes("user denied") ||
    m.includes("connection request reset") ||
    m.includes("rejected") ||
    m.includes("cancelled") ||
    m.includes("canceled") ||
    m.includes("closed") ||
    m.includes("aborted") ||
    m.includes("expired")
  );
}

function walletConnectErrorMessage(e: unknown): string {
  if (isWalletConnectCancelError(e)) return walletConnectCancelledMessage();
  return normalizeWalletConnectConnectError(e);
}

type Eip6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: unknown;
};

type EvmWalletPickerContextValue = {
  open: () => void;
  close: () => void;
  isOpen: boolean;
};

const EvmWalletPickerContext = createContext<EvmWalletPickerContextValue | null>(null);

function WalletPickerIcon({ opt }: { opt: WalletPickerOption }) {
  const [broken, setBroken] = useState(false);
  const src = resolveWalletOptionIcon(opt);
  if (!src || broken) {
    return (
      <span className="wallet-picker-icon-fallback" aria-hidden>
        {fallbackInitial(opt.name)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="wallet-picker-icon"
      width={32}
      height={32}
      onError={() => setBroken(true)}
    />
  );
}

export function useEvmWalletPicker(): EvmWalletPickerContextValue {
  const ctx = useContext(EvmWalletPickerContext);
  if (!ctx) throw new Error("useEvmWalletPicker must be used within EvmWalletPickerProvider");
  return ctx;
}

function EvmWalletPickerModal({
  open,
  onClose,
  reopenHint,
  onConsumeReopenHint,
  onWalletConnectCancelled,
}: {
  open: boolean;
  onClose: () => void;
  reopenHint: string | null;
  onConsumeReopenHint: () => void;
  onWalletConnectCancelled: () => void;
}) {
  const connectors = useConnectors();
  const { connectAsync, isPending, error, variables, reset } = useConnect();
  const { disconnectAsync } = useEvmDisconnect();
  const { isConnected, connector: activeConnector, address: activeAddress, chainId } = useAccount();
  const [switchingChain, setSwitchingChain] = useState(false);
  const [eip6963, setEip6963] = useState<Eip6963Detail[]>([]);
  const [options, setOptions] = useState<WalletPickerOption[]>([]);
  const [scanning, setScanning] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalErr(reopenHint ?? null);
  }, [open, reopenHint]);

  useEffect(() => {
    if (!open) return;
    const found = new Map<string, Eip6963Detail>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = window.setTimeout(() => setEip6963([...found.values()]), 280);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, [open]);

  const pendingIsWalletConnect =
    isPending && !!variables?.connector && isWalletConnectConnector(variables.connector);

  useEffect(() => {
    if (!error || !variables?.connector || !isWalletConnectConnector(variables.connector)) return;
    setLocalErr(walletConnectErrorMessage(error));
  }, [error, variables]);

  function requestClose() {
    if (pendingIsWalletConnect) {
      reset();
      onWalletConnectCancelled();
    } else if (isPending) {
      reset();
    }
    onClose();
  }

  const wagmiOptions = useMemo(
    () => dedupePickerOptions(connectors.map(connectorToPickerOption)),
    [connectors],
  );

  const extraOptions = useMemo(() => {
    const covered = new Set(
      wagmiOptions.flatMap((o) => [
        o.connector.id.toLowerCase(),
        o.name.toLowerCase(),
        ((o.connector as Connector & { rdns?: string }).rdns || "").toLowerCase(),
      ]),
    );
    const extras: WalletPickerOption[] = [];
    for (const d of eip6963) {
      const name = d.info.name?.trim() || "Browser wallet";
      const rdns = d.info.rdns?.toLowerCase() || "";
      if (covered.has(name.toLowerCase()) || (rdns && covered.has(rdns))) continue;
      const connector = injected({ target: d });
      extras.push({
        key: `eip6963-${d.info.uuid}`,
        name,
        icon: d.info.icon?.startsWith("data:") ? d.info.icon : null,
        connector,
      });
    }
    return dedupePickerOptions(extras);
  }, [eip6963, wagmiOptions]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setScanning(true);
    void resolveWalletPickerOptions([...wagmiOptions, ...extraOptions]).then((resolved) => {
      if (!cancelled) {
        setOptions(resolved);
        setScanning(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, wagmiOptions, extraOptions]);

  async function disconnectWallet() {
    if (isPending) reset();
    try {
      await disconnectAsync();
      onConsumeReopenHint();
      onClose();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function pick(opt: WalletPickerOption) {
    setLocalErr(null);
    onConsumeReopenHint();
    const connector = opt.connector;
    if (!connector) return;
    try {
      const sameConnector = isConnected && activeConnector?.id === connector.id;
      if (sameConnector && activeAddress) {
        if (chainId !== mainnet.id) await requestSwitchToEthereum(connector);
        onClose();
        return;
      }

      const switchingConnector = isConnected && activeConnector?.id && activeConnector.id !== connector.id;
      if (switchingConnector) {
        try {
          await disconnectAsync();
        } catch {
          /* connectAsync may still replace the session. */
        }
      }

      await connectAsync({ connector });
      if (isMobileClient() && isWalletConnectConnector(connector)) {
        await persistWalletConnectDeepLinkFromConnector(connector);
      }
      await requestSwitchToEthereum(connector);
      onConsumeReopenHint();
      onClose();
    } catch (e) {
      const wc = isWalletConnectConnector(connector);
      setLocalErr(wc ? walletConnectErrorMessage(e) : e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) return null;

  const pendingId = variables?.connector?.id;
  const connectError =
    localErr ||
    (error && variables?.connector && isWalletConnectConnector(variables.connector)
      ? walletConnectErrorMessage(error)
      : error
        ? error.message
        : null);
  const showWalletConnectCancelBanner =
    !!connectError && connectError === walletConnectCancelledMessage();

  return (
    <div className="wallet-picker-backdrop" role="presentation" onClick={requestClose}>
      <div
        className="wallet-picker-modal card-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wallet-picker-head">
          <div>
            <h2 id="wallet-picker-title">
              {isConnected && activeAddress ? "Wallet" : "Connect Ethereum wallet"}
            </h2>
            <p className="muted">
              {isConnected && activeAddress
                ? "Switch to another wallet or disconnect. Your address stays the same until you pick a different wallet."
                : "Connect your wallet for ERC-20 trades on Ethereum mainnet."}
            </p>
          </div>
          <button type="button" className="secondary wallet-picker-close" onClick={requestClose} aria-label="Close">
            ×
          </button>
        </div>

        {connectError && (
          <p
            className={`error-banner${showWalletConnectCancelBanner ? " wallet-connect-cancel-banner" : ""}`}
            role="alert"
          >
            {connectError}
          </p>
        )}
        {pendingIsWalletConnect && (
          <p className="wallet-approval-hint wallet-connect-scan-hint" role="status">
            {walletConnectPendingHint()}
          </p>
        )}
        {isPending && !pendingIsWalletConnect && (
          <p className="wallet-approval-hint" role="status">
            Approve the connection in your wallet popup. If no popup appears, unlock the wallet extension and click
            its icon, then return here and try again.
          </p>
        )}
        {!walletConnectConfigured && options.some((o) => isWalletConnectConnector(o.connector)) && (
          <p className="hint">WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID and restart the web app.</p>
        )}

        {isConnected && activeAddress && (
          <div className="wallet-picker-current card-surface">
            <span className="wallet-picker-current-label">Connected</span>
            <p className="wallet-picker-current-addr mono" title={activeAddress}>
              {activeAddress}
            </p>
            {chainId !== mainnet.id && (
              <div className="wallet-picker-wrong-chain">
                <p className="warn-banner wallet-picker-warn">This wallet is not on Ethereum yet.</p>
                <button
                  type="button"
                  className="secondary wallet-picker-switch-chain"
                  disabled={switchingChain || isPending}
                  onClick={() => {
                    setLocalErr(null);
                    setSwitchingChain(true);
                    void requestSwitchToEthereum(activeConnector)
                      .catch((e) => setLocalErr(e instanceof Error ? e.message : "The wallet did not switch to Ethereum."))
                      .finally(() => setSwitchingChain(false));
                  }}
                >
                  {switchingChain ? "Switching…" : "Switch to Ethereum"}
                </button>
              </div>
            )}
          </div>
        )}

        {isConnected && activeAddress && (
          <p className="wallet-picker-section-title">Switch wallet</p>
        )}

        <ul className="wallet-picker-list">
          {scanning && <li className="muted wallet-picker-empty">Scanning for installed wallets…</li>}
          {!scanning && options.length === 0 && (
            <li className="muted wallet-picker-empty">No connection options available. Install a wallet extension or configure WalletConnect.</li>
          )}
          {!scanning && options.map((opt) => {
            const busy = isPending && opt.connector && pendingId === opt.connector.id;
            const isActive =
              isConnected && opt.connector && activeConnector?.id === opt.connector.id && !!activeAddress;
            return (
              <li key={opt.key}>
                <button
                  type="button"
                  className={`wallet-picker-option${isActive ? " wallet-picker-option-active" : ""}`}
                  disabled={isPending}
                  onClick={() => pick(opt)}
                >
                  <WalletPickerIcon opt={opt} />
                  <span className="wallet-picker-label">
                    <strong>{opt.name}</strong>
                    {isActive && (
                      <span className="muted wallet-picker-sub">
                        Connected · {shortAddr(activeAddress)}
                      </span>
                    )}
                    {opt.connector && isWalletConnectConnector(opt.connector) && (
                      <span className="muted wallet-picker-sub">
                        {isMobileClient()
                          ? "Opens WalletConnect — choose MetaMask or another wallet and approve"
                          : "MetaMask in this browser, or scan the QR with a mobile wallet"}
                      </span>
                    )}
                    {opt.connector && isBaseFallbackConnector(opt.connector) && (
                      <span className="muted wallet-picker-sub">Sign in with Base (no extension required)</span>
                    )}
                  </span>
                  {busy && <span className="muted wallet-picker-busy">Connecting…</span>}
                </button>
              </li>
            );
          })}
        </ul>

        {isConnected && activeAddress && (
          <div className="wallet-picker-actions">
            <button
              type="button"
              className="wallet-picker-disconnect"
              disabled={isPending}
              onClick={() => void disconnectWallet()}
            >
              Disconnect wallet
            </button>
          </div>
        )}

        {!isConnected && (
          <p className="wallet-picker-agreement">
            By connecting, you agree to our{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}

export function EvmWalletPickerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reopenWalletConnectHint, setReopenWalletConnectHint] = useState<string | null>(null);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const onWalletConnectCancelled = useCallback(() => {
    setReopenWalletConnectHint(walletConnectCancelledMessage());
  }, []);
  const onConsumeReopenHint = useCallback(() => setReopenWalletConnectHint(null), []);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <EvmWalletPickerContext.Provider value={value}>
      {children}
      <EvmWalletPickerModal
        open={isOpen}
        onClose={close}
        reopenHint={reopenWalletConnectHint}
        onConsumeReopenHint={onConsumeReopenHint}
        onWalletConnectCancelled={onWalletConnectCancelled}
      />
    </EvmWalletPickerContext.Provider>
  );
}

type ConnectEvmWalletButtonProps = {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
};

export function ConnectEvmWalletButton({ children, className, disabled, title }: ConnectEvmWalletButtonProps) {
  const { open } = useEvmWalletPicker();
  const { isPending } = useConnect();
  const { address, isConnected } = useAccount();

  const label =
    children ??
    (isPending ? "Connecting…" : isConnected && address ? shortAddr(address) : "Connect wallet");

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || isPending}
      onClick={open}
      title={title ?? (isConnected && address ? "Switch or disconnect wallet" : undefined)}
    >
      {label}
    </button>
  );
}
