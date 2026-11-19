import { TranslatedText } from "../lib/language";
import { useLanguage } from "../lib/language";

export function TronChainSeparationNotice({ compact }: { compact?: boolean }) {
  const { t } = useLanguage();
  if (compact) {
    return (
      <p className="tron-separation compact" role="note">
        <strong>{t("Separate chain:")}</strong> {t("Tron TRC-20 escrows never share funds with Ethereum ERC-20 trades. Settlements stay on Tron only.")}
      </p>
    );
  }
  return (
    <div className="tron-separation card-surface" role="note">
      <span className="chain-network-badge tron"><TranslatedText text={"Tron · TRC-20"} /></span>
      <p>
        <strong>{t("Tron trades are isolated from Ethereum.")}</strong>{" "}
        {t("USDT here is TRC-20 on Tron — not ERC-20 on Ethereum. You cannot fund an Ethereum escrow from Tron or move escrow balances between chains inside 2Pescrow.")}
      </p>
    </div>
  );
}
