import { TranslatedText } from "../lib/language";
import { useEffect, useRef, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { mainnet } from "viem/chains";
import { useEvmDisconnect } from "../lib/useEvmDisconnect";
import { useEvmWalletPicker } from "../lib/evmWalletPicker";
import { tronNetworkName, useTronWallet } from "../lib/tron/TronWalletContext";
import { shortAddr } from "../lib/api";
import { useLanguage } from "../lib/language";

export function WalletControl() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { address: evmAddress, isConnected: evmConnected, chainId } = useAccount();
  const { isPending: switchingChain } = useSwitchChain();
  const { disconnect: disconnectEvm } = useEvmDisconnect();
  const { open: openEvmPicker } = useEvmWalletPicker();
  const { enabled: tronEnabled, address: tronAddress, walletName: tronWalletName, connect: connectTron, disconnect: disconnectTron, connecting: tronConnecting } = useTronWallet();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const connectedWalletCount = Number(evmConnected && !!evmAddress) + Number(tronEnabled && !!tronAddress);
  const buttonLabel = connectedWalletCount === 0
    ? t("Connect wallet")
    : connectedWalletCount > 1
      ? t("Wallets connected")
      : evmConnected && evmAddress
        ? `ETH ${shortAddr(evmAddress)}`
        : `TRON ${shortAddr(tronAddress!)}`;

  return (
    <div className="wallet-control" ref={rootRef}>
      <button
        type="button"
        className={`wallet-pill-btn wallet-pill-compact wallet-control-trigger${connectedWalletCount ? " wallet-pill-connected" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {connectedWalletCount > 0 && <span className="wallet-pill-dot" aria-hidden />}
        <span>{buttonLabel}</span>
        <span className="wallet-control-chevron" aria-hidden>⌄</span>
      </button>
      {open && (
        <div className="wallet-control-menu card-surface" role="dialog" aria-label={t("Wallet connections")}>
          <div className="wallet-control-heading">
            <div>
              <strong>{t("Wallet connections")}</strong>
              <p className="muted">{tronEnabled ? t("Choose the network used by this trade. The wallet and network must match the trade before you sign.") : t("Connect an Ethereum wallet for ERC-20 trades.")}</p>
            </div>
            <button type="button" className="secondary wallet-control-close" aria-label={t("Close wallet menu")} onClick={() => setOpen(false)}>×</button>
          </div>

          <section className="wallet-control-network" aria-label={t("Ethereum wallet")}>
            <div className="wallet-control-network-copy">
              <span className="wallet-control-chain">Ethereum</span>
              {evmConnected && evmAddress ? (
                <>
                  <span className="mono wallet-control-address">{shortAddr(evmAddress)}</span>
                  <span className={`wallet-control-status${chainId !== mainnet.id ? " is-warning" : ""}`}>
                    {chainId !== mainnet.id ? (switchingChain ? t("Switching to Ethereum…") : t("Wrong network · Ethereum mainnet required")) : t("Connected · Ethereum mainnet")}
                  </span>
                </>
              ) : <span className="wallet-control-status">{t("Connect for ERC-20 USDT trades")}</span>}
            </div>
            {evmConnected && evmAddress ? (
              <button type="button" className="secondary wallet-control-action" onClick={() => { setOpen(false); openEvmPicker(); }}>{t("Change")}</button>
            ) : (
              <button type="button" className="primary wallet-control-action" onClick={() => { setOpen(false); openEvmPicker(); }}>{t("Connect")}</button>
            )}
          </section>

          {tronEnabled && (
            <section className="wallet-control-network" aria-label={t("TRON wallet")}>
              <div className="wallet-control-network-copy">
                <span className="wallet-control-chain"><TranslatedText text={"TRON"} /></span>
                {tronAddress ? (
                  <>
                    <span className="mono wallet-control-address"><TranslatedText text={tronWalletName || "TRON"} /> · {shortAddr(tronAddress)}</span>
                    <span className="wallet-control-status">{`Connected · TRON ${tronNetworkName} · TRC-20 USDT`}</span>
                  </>
                ) : <span className="wallet-control-status">{`Connect for TRC-20 USDT trades · TRON ${tronNetworkName}`}</span>}
              </div>
              {tronAddress ? (
                <button type="button" className="secondary wallet-control-action" onClick={() => { disconnectTron(); setOpen(false); }}>{t("Disconnect")}</button>
              ) : (
                <button type="button" className="primary wallet-control-action" disabled={tronConnecting} onClick={() => { setOpen(false); void connectTron(); }}>{tronConnecting ? t("Opening…") : t("Connect")}</button>
              )}
            </section>
          )}

          {evmConnected && evmAddress && (
            <button type="button" className="linkish wallet-control-disconnect" onClick={() => { disconnectEvm(); setOpen(false); }}>{t("Disconnect Ethereum wallet")}</button>
          )}
          <p className="hint wallet-control-note">{tronEnabled ? t("Ethereum and TRON wallets are checked separately. A trade can only be signed with its matching network.") : t("Use Ethereum mainnet to sign your trade transactions.")}</p>
        </div>
      )}
    </div>
  );
}
