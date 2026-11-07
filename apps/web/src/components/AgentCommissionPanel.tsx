import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language";

type AgentCommissionView = {
  enrolled: boolean;
  payoutReady: boolean;
  displayName: string | null;
  payoutAddress: string | null;
  payoutChain: string | null;
  commissionRatePercent: number;
  usesDefaultRate: boolean;
  coolingOffEndsAt: string | null;
  coolingOffActive: boolean;
  finalizedCaseCount: number;
  minFinalizedCases: number;
  payableAtomic: string;
  payoutRequests: { id: string; amountAtomic: string; status: string; createdAt: string }[];
};

export function AgentCommissionPanel() {
  const { authHeaders, user } = useAuth();
  const { t } = useLanguage();
  const [view, setView] = useState<AgentCommissionView | null>(null);
  const [name, setName] = useState("");
  const [chain, setChain] = useState<"ethereum" | "tron">("ethereum");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView(await api<AgentCommissionView>("/v1/me/agent-commission", { headers: authHeaders() }));
  }, [authHeaders]);

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [load]);

  useEffect(() => {
    if (!user || view?.enrolled) return;
    setName((current) => current || user.displayName?.trim() || "");
  }, [user, view?.enrolled]);

  async function enroll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      setView(await api<AgentCommissionView>("/v1/me/agent-commission/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ displayName: name.trim(), payoutAddress: address.trim(), payoutChain: chain }),
      }));
      setMsg(t("Commission is on. The first 7 days do not pay, and the rate stays at the platform default until an admin changes it."));
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function requestPayout() {
    setBusy(true);
    setErr(null);
    try {
      setView(await api<AgentCommissionView>("/v1/me/agent-commission/payout-requests", {
        method: "POST",
        headers: authHeaders(),
      }));
      setMsg(t("Payout request submitted. An admin sends it to the wallet you confirmed."));
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!view) return <p className="muted">{t("Loading…")}</p>;

  return (
    <section className="card-surface" style={{ marginTop: "1rem" }}>
      <p className="eyebrow">{t("Dispute agent commission")}</p>
      <h2>{t("Case commission")}</h2>
      <p className="muted">
        {t("This is separate from referral earnings. The default is 0.5% of the platform fee on a case, paid only after the on-chain dispute payout is final. You need")}{" "}
        {view.minFinalizedCases} {t("finalized cases and at least $20 before cash-out.")}
      </p>
      {err && <p className="error-banner">{err}</p>}
      {msg && <p className="ok-banner">{msg}</p>}
      <dl className="kv">
        <dt>{t("Finalized cases")}</dt>
        <dd>{view.finalizedCaseCount}</dd>
        <dt>{t("Your rate")}</dt>
        <dd>{view.enrolled ? `${view.commissionRatePercent}%${view.usesDefaultRate ? ` (${t("platform default")})` : ""}` : t("Not opted in")}</dd>
      </dl>
      {!view.enrolled ? (
        <form className="form-stack" onSubmit={enroll}>
          <p className="muted">{t("Opt in with the name you want on this profile and the wallet that should receive payouts. You cannot choose the rate.")}</p>
          <label>
            {t("Name on the commission profile")}
            <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label>
            {t("Network")}
            <select value={chain} onChange={(e) => setChain(e.target.value as "ethereum" | "tron")}>
              <option value="ethereum">{t("Ethereum (ERC-20 USDT)")}</option>
              <option value="tron">{t("Tron (TRC-20 USDT)")}</option>
            </select>
          </label>
          <label>
            {t("Payout wallet address")}
            <input required className="mono" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={chain === "tron" ? "T…" : "0x…"} />
          </label>
          <button type="submit" disabled={busy}>{busy ? t("Saving…") : t("Opt into case commission")}</button>
        </form>
      ) : (
        <>
          <dl className="kv">
            <dt>{t("Name")}</dt>
            <dd>{view.displayName}</dd>
            <dt>{t("Payout wallet")}</dt>
            <dd className="mono">{view.payoutAddress}</dd>
            <dt>{t("Payable balance")}</dt>
            <dd>{formatAmount(view.payableAtomic)}</dd>
            {view.coolingOffActive && view.coolingOffEndsAt && (
              <>
                <dt>{t("Cooling-off until")}</dt>
                <dd>{new Date(view.coolingOffEndsAt).toLocaleString()}</dd>
              </>
            )}
          </dl>
          <p className="muted">
            {view.coolingOffActive
              ? t("Cases finalized before the cooling-off ends are not paid.")
              : t("Cases finalized from now on can accrue if you are not a party on that trade.")}
          </p>
          <button type="button" disabled={busy} onClick={() => void requestPayout()}>
            {busy ? t("Submitting…") : t("Request payout of the payable balance")}
          </button>
          {view.payoutRequests[0] && (
            <p className="muted">{t("Latest request")}: {view.payoutRequests[0].status} · {formatAmount(view.payoutRequests[0].amountAtomic)}</p>
          )}
        </>
      )}
    </section>
  );
}
