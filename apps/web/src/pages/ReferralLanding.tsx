import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { storeReferralCode } from "../lib/referralStorage";
import { useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";

export function ReferralLandingPage({ code }: { code: string }) {
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [name, setName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ referrerDisplayName: string; referralCode: string }>(
          `/v1/referral/landing/${encodeURIComponent(code)}`
        );
        storeReferralCode(res.referralCode);
        setName(res.referrerDisplayName?.trim() || null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [code]);

  return (
    <div className="page narrow">
      <p className="eyebrow">{t("Referral invite")}</p>
      <h1>{t("You're invited to 2Pescrow")}</h1>
      {err && <p className="error-banner">{err}</p>}
      {!err && (
        <>
          <p className="muted">
            {name ? (
              <>
                <strong>{name}</strong> {t("invited you to trade safely with buyer-funded USDT escrow.")}
              </>
            ) : (
              t("Loading invite…")
            )}
          </p>
          <div className="hero-actions">
            <button type="button" onClick={() => navigate(`/signin?ref=${code}`)}>
              {t("Sign in & join")}
            </button>
            <button type="button" className="secondary" onClick={() => navigate("/")}>
              {t("Learn more")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
