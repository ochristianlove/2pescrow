import { useState } from "react";
import { createPortal } from "react-dom";
import { TranslatedText, useLanguage } from "../lib/language";
import { PrivacyPage } from "../pages/Privacy";
import { TermsPage } from "../pages/Terms";

export type LegalDoc = "terms" | "privacy";

export function LegalReadDialog({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const { t } = useLanguage();
  const [active, setActive] = useState<LegalDoc>(doc);
  return createPortal(
    <div className="legal-read-backdrop" role="presentation" onClick={onClose}>
      <div
        className="legal-read-dialog card-surface"
        role="dialog"
        aria-modal="true"
        aria-label={t(active === "terms" ? "Terms of Service" : "Privacy Policy")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="legal-read-bar">
          <div className="legal-read-tabs">
            <button type="button" className={active === "terms" ? "is-on" : ""} onClick={() => setActive("terms")}>
              <TranslatedText text="Terms" />
            </button>
            <button type="button" className={active === "privacy" ? "is-on" : ""} onClick={() => setActive("privacy")}>
              <TranslatedText text="Privacy Policy" />
            </button>
          </div>
          <button type="button" className="secondary" onClick={onClose}>{t("Close")}</button>
        </div>
        <div className="legal-read-body">
          {active === "terms" ? <TermsPage /> : <PrivacyPage />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
