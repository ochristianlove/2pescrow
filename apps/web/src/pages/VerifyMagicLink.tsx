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
    setStatus(t("Verifying magic link…"));
    (async () => {
      try {
        const referralCode = peekReferralCode();
        const res = await api<{ token: string; user: SessionUser }>("/v1/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, referralCode: referralCode || undefined }),
        });
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
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token; t() only for initial error copy
  }, [navigate, setSession]);

  return (
    <div className="page narrow">
      <h1>{t("Magic link")}</h1>
      {err ? <p className="error-banner">{err}</p> : <p className="muted">{status}</p>}
      {err && (
        <button type="button" onClick={() => navigate("/signin")}>
          {t("Request a new link")}
        </button>
      )}
    </div>
  );
}
