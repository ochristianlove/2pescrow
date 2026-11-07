import type { ReactNode } from "react";
import { Link } from "../lib/router";
import { useLanguage } from "../lib/language";

export function LegalDocumentLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="page legal-page">
      <p className="eyebrow">{t("Legal")}</p>
      <h1>{title}</h1>
      <p className="muted legal-updated">{t("Last updated")}: {updated}</p>
      <div className="card-surface legal-prose">{children}</div>
      <p className="legal-back">
        <Link to="/" className="linkish">{t("Back to home")}</Link>
        {" · "}
        <Link to="/terms" className="linkish">{t("Terms of Service")}</Link>
        {" · "}
        <Link to="/privacy" className="linkish">{t("Privacy Policy")}</Link>
      </p>
    </div>
  );
}
