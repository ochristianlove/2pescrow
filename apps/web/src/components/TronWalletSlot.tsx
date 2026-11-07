import { formatAmount, shortAddr } from "../lib/api";
import { useTronWallet } from "../lib/tron/TronWalletContext";
import { useLanguage } from "../lib/language";

export function TronWalletSlot() {
  const { t } = useLanguage();
  const {
    enabled,
    address,
    walletName,
    usdtBalanceAtomic,
    connecting,
    error,
    connect,
    disconnect,
    refreshBalance,
    usdtTokenAddress,
  } = useTronWallet();
  if (!enabled) return null;

  return (
    <div className="tron-wallet-slot">
      {!address ? (
        <div className="tron-wallet-disconnected">
          <button type="button" className="secondary tron-connect" disabled={connecting} onClick={() => connect()}>
            {connecting ? t("Opening wallet options…") : t("Connect TRON wallet")}
          </button>
          {error && (
            <p className="error-banner tron-connect-err" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="wallet-connected tron-connected">
          <span className="mono" title={address}>
            {walletName || "TRON"} {shortAddr(address)}
          </span>
          {usdtBalanceAtomic != null ? (
            <span className="tron-balance">{formatAmount(usdtBalanceAtomic.toString())} USDT</span>
          ) : (
            <button type="button" className="linkish" onClick={() => refreshBalance()}>
              {t("Refresh USDT")}
            </button>
          )}
          <button type="button" className="secondary" onClick={() => disconnect()}>
            {t("Disconnect Tron")}
          </button>
        </div>
      )}
      {address && !usdtTokenAddress && (
        <span className="tron-wallet-err">{t("Set Tron USDT contract in admin to show balance.")}</span>
      )}
    </div>
  );
}
