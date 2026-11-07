import { useState } from "react";
import { useAccount } from "wagmi";
import { useEvmDisconnect } from "../lib/useEvmDisconnect";
import { useLanguage } from "../lib/language";
import { describeWalletChain, requestSwitchToEthereum } from "../lib/switchToEthereum";

type Props = {
  chainId?: number;
};

export function EvmWrongChainBanner({ chainId }: Props) {
  const { t } = useLanguage();
  const { connector } = useAccount();
  const { disconnect, isPending: disconnecting } = useEvmDisconnect();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  async function switchToEthereum() {
    setSwitchError(null);
    setSwitching(true);
    try {
      await requestSwitchToEthereum(connector);
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : "The wallet did not switch to Ethereum.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="wallet-wrong-chain">
      <p className="error-banner">
        {t("Your wallet is connected, but it is on")} {describeWalletChain(chainId)}.{" "}
        {t("Ethereum trades use Ethereum only. Switch the wallet to Ethereum, then link it. A saved wallet address does not change the network.")}
      </p>
      {switching && <p className="hint">{t("Approve the network switch in your wallet popup.")}</p>}
      {switchError && <p className="error-banner">{switchError}</p>}
      <div className="hero-actions">
        <button type="button" className="secondary" disabled={switching || disconnecting} onClick={() => void switchToEthereum()}>
          {switching ? t("Switching…") : t("Switch wallet to Ethereum")}
        </button>
        <button type="button" className="secondary" disabled={switching || disconnecting} onClick={() => disconnect()}>
          {disconnecting ? t("Disconnecting…") : t("Disconnect wallet")}
        </button>
      </div>
    </div>
  );
}
