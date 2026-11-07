import { CHAIN_LABELS } from "@2pescrow/shared";
import { useLanguage } from "../lib/language";

export function ChainBadge({ chain }: { chain?: string | null }) {
  const { t } = useLanguage();
  const key = chain === "tron" ? "tron" : chain === "ethereum" ? "ethereum" : "legacy";
  const label = key === "tron" ? CHAIN_LABELS.tron : key === "ethereum" ? CHAIN_LABELS.ethereum : "Earlier EVM trade";
  return <span className={`chain-badge chain-${key === "legacy" ? "ethereum" : key}`}>{t(label)}</span>;
}
