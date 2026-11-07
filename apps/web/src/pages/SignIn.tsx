import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { storeReferralCode, peekReferralCode } from "../lib/referralStorage";
import { useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";

export function SignInPage() {
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [refHint, setRefHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      storeReferralCode(ref);
      setRefHint(ref);
    } else if (peekReferralCode()) {
      setRefHint(peekReferralCode());
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await api<{ ok: boolean; message: string }>("/v1/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setMsg(res.message);
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <p className="eyebrow">{t("Buyers & sellers")}</p>
      <h1>{t("Sign in with magic link")}</h1>
      <p className="muted">
        {t(
          "No password. We email a one-time link — use it to open your dashboard, link your wallet, and view your full transaction history as a buyer or seller."
        )}
      </p>
      {refHint && (
        <p className="ok-banner">
          {t("Referral active — you'll be linked to invite code")} <code>{refHint}</code> {t("when you sign in.")}
        </p>
      )}

      <form className="card-surface form-stack" onSubmit={submit}>
        <label>
          {t("Email")}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        {err && <p className="error-banner">{err}</p>}
        {msg && <p className="ok-banner">{msg}</p>}
        <button type="submit" disabled={busy}>
          {busy ? t("Sending…") : t("Email me a sign-in link")}
        </button>
      </form>

      <p className="hint">
        {t("Prefer browsing without an account?")}{" "}
        <button type="button" className="linkish" onClick={() => navigate("/trades")}>
          {t("View public trades")}
        </button>
      </p>
    </div>
  );
}
