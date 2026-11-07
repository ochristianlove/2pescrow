import { useEffect, useState, type FormEvent } from "react";
import { api, formatAmount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { useLanguage } from "../lib/language";
import { ContractTerms } from "../components/ContractTerms";

type InvitePreview = {
  id: string;
  tradeCode: string;
  title: string;
  description?: string | null;
  chain: string;
  tokenSymbol: string;
  amountAtomic: string;
  joinDeadlineAt?: string | null;
};

export function JoinTradePage() {
  const { user, authHeaders } = useAuth();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [initialCode] = useState(() => new URLSearchParams(window.location.search).get("code") || localStorage.getItem("2pescrow_join_code") || "");
  const [code, setCode] = useState(initialCode);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialCode.trim()) return;
    api<InvitePreview>(`/v1/escrows/code/${encodeURIComponent(initialCode.trim().toUpperCase())}`)
      .then((result) => { setPreview(result); setError(null); setCode(result.tradeCode); })
      .catch((e) => { setPreview(null); setError(e instanceof Error ? e.message : String(e)); });
  }, []);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setPreview(null);
    setError(null);
    try {
      const result = await api<InvitePreview>(`/v1/escrows/code/${encodeURIComponent(code.trim().toUpperCase())}`);
      setPreview(result);
      setCode(result.tradeCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function join() {
    if (!user) {
      localStorage.setItem("2pescrow_join_code", code.trim().toUpperCase());
      navigate("/signin");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trade = await api<{ id: string }>("/v1/escrows/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      localStorage.removeItem("2pescrow_join_code");
      navigate(`/trades/${trade.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow join-trade-page">
      <p className="eyebrow">{t("Seller · Join a trade")}</p>
      <h1>{t("Enter your trade code")}</h1>
      <p className="muted">{t("Confirm the deal details, then join with your account. Your profile will be linked as the seller in the same shared trade room.")}</p>
      <form className="card-surface form-stack" onSubmit={lookup}>
        <label>
          {t("Trade code")}
          <input className="join-code-input" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }} placeholder="K7M4-QP2N" autoCapitalize="characters" autoComplete="off" />
        </label>
        <button type="submit" className="secondary" disabled={!code.trim()}>{t("Find trade")}</button>
        {error && <p className="error-banner">{error}</p>}
        {preview && (
          <div className="invite-preview">
            <p className="eyebrow">{t("Review before joining")}</p>
            <h2>{preview.title}</h2>
            <ContractTerms text={preview.description} empty={t("No extra terms provided.")} />
            <dl className="kv">
              <dt>{t("Amount")}</dt><dd>{preview.tokenSymbol === "TRON_USDT" ? "USDT" : preview.tokenSymbol} {formatAmount(preview.amountAtomic)}</dd>
              <dt>{t("Network")}</dt><dd>{preview.chain === "tron" ? "Tron" : preview.chain === "ethereum" ? "Ethereum" : "Earlier EVM trade"}</dd>
              <dt>{t("Your role")}</dt><dd>{t("Seller")}</dd>
            </dl>
            <p className="hint">{t("Joining links your seller account only. After you join, connect the wallet that should receive funds and tap “Link my seller wallet” in the trade room—nothing is linked automatically from your profile.")}</p>
            <button type="button" onClick={join} disabled={busy}>{busy ? t("Joining trade…") : user ? t("Join as seller") : t("Sign in to join as seller")}</button>
          </div>
        )}
      </form>
    </div>
  );
}
