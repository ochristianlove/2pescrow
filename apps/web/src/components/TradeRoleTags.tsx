import { useLanguage } from "../lib/language";

export function TradeRoleTags({ buyer, seller }: { buyer?: string | null; seller?: string | null }) {
  const { t } = useLanguage();
  return (
    <div className="trade-role-tags">
      <span className="trade-role-tag">{t("trade")}</span>
      <span className="trade-role-tag trade-role-tag-buyer">
        <span>{t("buyer")}</span>
        {buyer ? <span className="trade-role-tag-name">· {buyer}</span> : null}
      </span>
      <span className="trade-role-tag trade-role-tag-seller">
        <span>{t("seller")}</span>
        {seller ? <span className="trade-role-tag-name">· {seller}</span> : null}
      </span>
    </div>
  );
}
