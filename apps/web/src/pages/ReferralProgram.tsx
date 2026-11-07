import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, formatAmount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { useWorkspaceGuard } from "../lib/useWorkspaceGuard";
import { useLanguage } from "../lib/language";
import { CopyButton } from "../components/CopyButton";
import { isMobileClient } from "../lib/mobileClient";
import { AgentCommissionPanel } from "../components/AgentCommissionPanel";

/** Hardcoded $20 minimum (6-decimal USDT/USDC atomic); matches API `REFERRAL_PAYOUT_MIN_ATOMIC`. */
const PAYOUT_MIN_ATOMIC = 20_000_000n;

type PayoutRequestRow = {
  id: string;
  amountAtomic: string;
  payoutAddress: string;
  payoutChain: string;
  status: string;
  createdAt: string;
  adminNote?: string | null;
};

type ReferralProfile = {
  enrolled: boolean;
  referralCode?: string;
  referralUrl?: string;
  tier?: string;
  successfulReferrals?: number;
  totalEarnedAtomic?: string;
  pendingBalanceAtomic?: string;
  totalPaidAtomic?: string;
  commissionBps?: number;
  commissionRatePercent?: number;
  isAgentRate?: boolean;
  referredTradeVolumeAtomic?: string;
  payoutRequests?: PayoutRequestRow[];
  notifications?: { id: string; message: string; createdAt: string; readAt?: string | null }[];
  referees?: { email: string | null; joinedAt: string }[];
  tierInfo?: { bronze: number; silver: number; gold: number; platinum: number };
};

export function ReferralProgramPage() {
  const { authHeaders, user: authUser } = useAuth();
  const { user, ready } = useWorkspaceGuard();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [payoutChain, setPayoutChain] = useState<"ethereum" | "tron">("ethereum");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);

  const load = useCallback(async () => {
    setProfile(await api<ReferralProfile>("/v1/me/referral", { headers: authHeaders() }));
  }, [authHeaders]);

  useEffect(() => {
    if (!ready || !user) return;
    load().catch((e) => setErr(String(e)));
  }, [ready, user, load]);

  useEffect(() => {
    if (!authUser || profile?.enrolled) return;
    setDisplayName((current) => current || authUser.displayName?.trim() || authUser.email?.trim() || "");
  }, [authUser, profile?.enrolled]);

  async function enroll(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/v1/referral/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ displayName: displayName || undefined }),
      });
      setMsg(t("You're in! Share your link below."));
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const pendingAtomic = profile?.pendingBalanceAtomic || "0";
  const pendingBig = BigInt(pendingAtomic);
  const meetsPayoutMinimum = pendingBig >= PAYOUT_MIN_ATOMIC;
  const hasPendingPayout = (profile?.payoutRequests || []).some((r) => r.status === "pending");

  async function submitPayoutRequest(e: FormEvent) {
    e.preventDefault();
    if (!profile?.enrolled) return;
    setPayoutBusy(true);
    setErr(null);
    try {
      await api("/v1/me/referral/payout-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          amountAtomic: pendingAtomic,
          payoutAddress: payoutAddress.trim(),
          payoutChain,
        }),
      });
      setMsg(t("Payout request submitted. We will review and send funds to your wallet."));
      setPayoutAddress("");
      await load();
    } catch (error) {
      setErr(error instanceof Error ? error.message : String(error));
    } finally {
      setPayoutBusy(false);
    }
  }

  const tierLabel = (tier: string | undefined) => {
    const key = tier || "bronze";
    if (key === "silver") return t("Silver");
    if (key === "gold") return t("Gold");
    if (key === "platinum") return t("Platinum");
    return t("Bronze");
  };

  if (!ready || !user) return <p className="muted">{t("Loading…")}</p>;

  return (
    <div className="page">
      {authUser?.role === "agent" && <AgentCommissionPanel />}
      <section className="referral-hero card-surface">
        <p className="eyebrow">{t("Earn with 2Pescrow")}</p>
        <h1>{t("Refer traders. Earn 2% of platform profit.")}</h1>
        <p className="muted">
          {t("Share your personal link. When someone you referred completes a successful escrow as buyer or seller, you earn")}{" "}
          <strong>{t("2% of our fee")}</strong>
          {t(". No wallet needed — we track and pay your balance.")}
          {authUser?.role === "agent" && (
            <>
              {" "}
              {t("That referral cut stacks with case commission. They are paid separately.")}
            </>
          )}
        </p>
        <ul className="how-list">
          <li>
            <strong>{t("Bronze → Platinum")}</strong>
            {t(" — more successful referral trades, higher status.")}
          </li>
          <li>
            {t("Only one side needs your link — e.g. refer the buyer; the seller can join normally with the trade code.")}
          </li>
        </ul>
      </section>

      {err && <p className="error-banner">{err}</p>}
      {msg && <p className="ok-banner">{msg}</p>}

      {!profile?.enrolled ? (
        <form className="card-surface form-stack" onSubmit={enroll}>
          <h2>{t("Become a referrer")}</h2>
          <label>
            {t("Public name (optional)")}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Christian" />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? t("Creating link…") : t("Get my referral link")}
          </button>
        </form>
      ) : (
        <div className="detail-grid">
          <section className="card-surface">
            <h2>{t("Your link")}</h2>
            <p className="mono referral-url">{profile.referralUrl}</p>
            <div className="action-row">
              <CopyButton
                text={profile.referralUrl || ""}
                className=""
                label={t("Copy link")}
                copiedLabel={t("Link copied!")}
              />
              <button type="button" className="secondary" onClick={() => navigate("/app")}>
                {t("Back to dashboard")}
              </button>
            </div>
            <dl className="kv" style={{ marginTop: "1rem" }}>
              <dt>{t("Status tier")}</dt>
              <dd>{tierLabel(profile.tier)}</dd>
              <dt>{t("Signups via your link")}</dt>
              <dd>{profile.referees?.length ?? 0}</dd>
              <dt>{t("Successful referral trades")}</dt>
              <dd>{profile.successfulReferrals ?? 0}</dd>
              <dt>{t("Conversion rate")}</dt>
              <dd>
                {(profile.referees?.length ?? 0) > 0
                  ? `${Math.round(((profile.successfulReferrals ?? 0) / (profile.referees?.length ?? 1)) * 100)}%`
                  : "—"}
              </dd>
              <dt>{t("Referred trade volume")}</dt>
              <dd>{formatAmount(profile.referredTradeVolumeAtomic || "0")}</dd>
              <dt>{t("Commission rate")}</dt>
              <dd>
                {profile.commissionRatePercent ?? 2}% {t("of platform profit")}
              </dd>
              <dt>{t("Total earned")}</dt>
              <dd>
                {formatAmount(profile.totalEarnedAtomic || "0")} {t("(6 dec.)")}
              </dd>
              <dt>{t("Pending payout")}</dt>
              <dd>{formatAmount(profile.pendingBalanceAtomic || "0")}</dd>
              <dt>{t("Paid out")}</dt>
              <dd>{formatAmount(profile.totalPaidAtomic || "0")}</dd>
            </dl>

            <h3 style={{ marginTop: "1.25rem" }}>{t("Request payout")}</h3>
            <p className="referral-payout-min-notice" role="note">
              {t("To request a withdrawal, your pending referral balance must be $20.00 or above.")}
            </p>
            <p className="muted">
              {t(
                "Submit your Ethereum wallet (0x…) or Tron wallet (T…). We pay your full pending balance per request when you meet the minimum. One pending request at a time."
              )}
            </p>
            {pendingBig <= 0n ? (
              <p className="muted">{t("No balance available for payout yet.")}</p>
            ) : !meetsPayoutMinimum ? (
              <p className="muted">
                {t("Minimum payout is $20.00. Your pending balance is below that threshold.")}
              </p>
            ) : hasPendingPayout ? (
              <p className="muted">{t("You have a payout request awaiting admin review.")}</p>
            ) : (
              <form className="form-stack" onSubmit={submitPayoutRequest}>
                <label>
                  {t("Network")}
                  <select value={payoutChain} onChange={(e) => setPayoutChain(e.target.value as "ethereum" | "tron")}>
                    <option value="ethereum">{t("Ethereum (ERC-20 USDT)")}</option>
                    {!isMobileClient() && <option value="tron">{t("Tron (TRC-20 USDT)")}</option>}
                  </select>
                </label>
                <label>
                  {t("Payout wallet address")}
                  <input
                    required
                    className="mono"
                    value={payoutAddress}
                    onChange={(e) => setPayoutAddress(e.target.value)}
                    placeholder={payoutChain === "tron" ? "T…" : "0x…"}
                  />
                </label>
                {(authUser?.wallets?.length ?? 0) > 0 && (
                  <div className="wallet-link-actions">
                    <span className="muted">{t("Use a wallet saved on your profile:")}</span>
                    {authUser!.wallets!.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setPayoutAddress(w.address);
                          if (w.address.startsWith("T")) setPayoutChain("tron");
                          else setPayoutChain("ethereum");
                        }}
                      >
                        {w.address.slice(0, 8)}…{w.address.slice(-4)}
                      </button>
                    ))}
                  </div>
                )}
                <p className="muted">
                  {t("Amount:")} <strong>{formatAmount(pendingAtomic)}</strong> {t("(full pending balance)")}
                </p>
                <button type="submit" disabled={payoutBusy}>
                  {payoutBusy ? t("Submitting…") : t("Submit payout request")}
                </button>
              </form>
            )}

            {(profile.payoutRequests || []).length > 0 && (
              <>
                <h3 style={{ marginTop: "1.25rem" }}>{t("Payout history")}</h3>
                <ul className="activity-list">
                  {(profile.payoutRequests || []).map((r) => (
                    <li key={r.id}>
                      {formatAmount(r.amountAtomic)} → <span className="mono">{r.payoutAddress}</span> ({r.payoutChain === "tron" ? "Tron" : r.payoutChain === "ethereum" ? "Ethereum" : "Earlier EVM"}) ·{" "}
                      {r.status}
                      {r.adminNote ? ` — ${r.adminNote}` : ""}
                      <span className="muted"> · {new Date(r.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card-surface">
            <h2>{t("Your referees")}</h2>
            {(profile.referees || []).length === 0 && (
              <p className="muted">{t("No one has registered via your link yet. Share your URL on social or with traders.")}</p>
            )}
            <ul className="activity-list">
              {(profile.referees || []).map((r, i) => (
                <li key={i}>
                  {r.email || t("User")} · {t("joined")} {new Date(r.joinedAt).toLocaleDateString()}
                </li>
              ))}
            </ul>

            <h3 style={{ marginTop: "1.25rem" }}>{t("Notifications")}</h3>
            <ul className="activity-list">
              {(profile.notifications || []).map((n) => (
                <li key={n.id}>
                  {n.message}
                  <span className="muted"> · {new Date(n.createdAt).toLocaleString()}</span>
                </li>
              ))}
              {(profile.notifications || []).length === 0 && <li className="muted">{t("Commission alerts appear here.")}</li>}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
