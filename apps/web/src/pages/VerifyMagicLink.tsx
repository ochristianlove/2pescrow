import { TranslatedText } from "../lib/language";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth, type SessionUser } from "../lib/auth";
import { clearReferralCode, peekReferralCode } from "../lib/referralStorage";
import { useRouter } from "../lib/router";
import { workspaceEntryPath } from "../lib/workspaceGate";
import { useLanguage } from "../lib/language";

export function VerifyMagicLinkPage() {
  const { navigate } = useRouter();
  const { setSession } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState(() => t("Verifying magic link…"));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setErr(t("Missing token"));
      return;
    }
    let cancelled = false;

    const verifyOnWeb = async () => {
      if (cancelled) return;
      setStatus(t("Verifying magic link…"));
      try {
        const referralCode = peekReferralCode();
        const res = await api<{ token: string; user: SessionUser }>("/v1/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, referralCode: referralCode || undefined }),
        });
        if (cancelled) return;
        clearReferralCode();
        setSession(res.token, res.user);
        const joinCode = localStorage.getItem("2pescrow_join_code");
        if (joinCode) {
          localStorage.removeItem("2pescrow_join_code");
          setStatus(t("Signed in — opening your trade invitation…"));
          navigate(`/join?code=${encodeURIComponent(joinCode)}`);
        } else {
          setStatus(t("Signed in — opening your dashboard…"));
          navigate(workspaceEntryPath(res.user));
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    };

    const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const stayOnWeb = params.get("web") === "1";
    if (phone && !stayOnWeb) {
      setStatus(t("Opening the 2Pescrow app…"));
      const fallback = new URL(window.location.href);
      fallback.searchParams.set("web", "1");
      const encodedToken = encodeURIComponent(token);
      if (/Android/i.test(navigator.userAgent)) {
        const fallbackUrl = encodeURIComponent(fallback.toString());
        window.location.href = `intent://auth/verify?token=${encodedToken}#Intent;scheme=twopescrow;package=com.twopescrow.app;S.browser_fallback_url=${fallbackUrl};end`;
      } else {
        window.location.href = `twopescrow://auth/verify?token=${encodedToken}`;
        const timer = window.setTimeout(() => {
          if (document.visibilityState === "visible") void verifyOnWeb();
        }, 1500);
        const onHide = () => {
          if (document.visibilityState === "hidden") cancelled = true;
        };
        document.addEventListener("visibilitychange", onHide);
        return () => {
          cancelled = true;
          window.clearTimeout(timer);
          document.removeEventListener("visibilitychange", onHide);
        };
      }
      return () => {
        cancelled = true;
      };
    }

    void verifyOnWeb();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token; t() only for initial error copy
  }, [navigate, setSession]);

  return (
    <div className="page narrow">
      <h1>{t("Magic link")}</h1>
      {err ? <p className="error-banner"><TranslatedText text={err} /></p> : <p className="muted">{status}</p>}
      {!err && status === t("Opening the 2Pescrow app…") && (
        <button
          type="button"
          onClick={() => {
            const next = new URL(window.location.href);
            next.searchParams.set("web", "1");
            window.location.assign(next.toString());
          }}
        >
          {t("Continue on the website")}
        </button>
      )}
      {err && (
        <button type="button" onClick={() => navigate("/signin")}>
          {t("Request a new link")}
        </button>
      )}
    </div>
  );
}
