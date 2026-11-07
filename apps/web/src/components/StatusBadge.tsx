import { useLanguage } from "../lib/language";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  return <span className={`badge status-${status}`}>{t(status)}</span>;
}
