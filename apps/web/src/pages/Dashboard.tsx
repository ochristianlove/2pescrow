import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatAmount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { useWorkspaceGuard } from "../lib/useWorkspaceGuard";
import { StatusBadge } from "../components/StatusBadge";
import type { Escrow } from "../lib/types";
import { useLanguage } from "../lib/language";
import { useLiveTradeUpdates } from "../lib/useLiveTradeUpdates";
import { useLiveNotifications } from "../lib/liveNotifications";
import { eventLabel } from "../lib/eventLabel";
import { AgentApplicationCard, type AgentApplicationContext } from "../components/AgentApplicationCard";
import { useTradeListWindow } from "../lib/useTradeListWindow";
import { userDisplayLabel } from "../lib/userDisplay";
import { TradePartyBadge } from "../components/TradePartyBadge";

type DashboardData = {
  user: { email: string | null; role: string };
  wallets: { address: string }[];
  stats: {
    activeEscrows: number;
    completed: number;
    inDispute: number;
    totalValueLockedAtomic: string;
    totalEscrows: number;
  };
  myTrades?: Escrow[];
  latestEscrows?: Escrow[];
};

type HistoryRow = {
  id: string;
  eventName: string;
  escrowTitle: string;
  amountAtomic: string;
  tokenSymbol: string;
  explorerTx?: string | null;
  createdAt: string;
};

type HistoryPage = { items: HistoryRow[]; nextCursor: string | null };

const HISTORY_PAGE = 5;

type ReferralSummary = {
  enrolled: boolean;
  successfulReferrals?: number;
  referees?: { email: string | null; joinedAt: string }[];
  pendingBalanceAtomic?: string;
};

export function DashboardPage() {
  const { authHeaders } = useAuth();
  const { user, ready } = useWorkspaceGuard();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const { syncEscrowIds } = useLiveNotifications();
  const [data, setData] = useState<DashboardData | null>(null);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const historyCount = useRef(HISTORY_PAGE);
  const [err, setErr] = useState<string | null>(null);
  const [agentApply, setAgentApply] = useState<AgentApplicationContext | null>(null);
  const [agentApplyLoading, setAgentApplyLoading] = useState(true);
  const [agentSectionOpen, setAgentSectionOpen] = useState(false);

  const loadAgentApplication = useCallback(async () => {
    setAgentApplyLoading(true);
    try {
      const ctx = await api<AgentApplicationContext>("/v1/me/agent-application", { headers: authHeaders() });
      setAgentApply(ctx);
    } catch {
      setAgentApply(null);
    } finally {
      setAgentApplyLoading(false);
    }
  }, [authHeaders]);

  const load = useCallback(async () => {
    try {
      const [dash, hist, ref] = await Promise.all([
        api<DashboardData>("/v1/me/dashboard", { headers: authHeaders() }),
        api<HistoryPage>(`/v1/me/history?limit=${historyCount.current}`, { headers: authHeaders() }),
        api<ReferralSummary>("/v1/me/referral", { headers: authHeaders() }),
        loadAgentApplication(),
      ]);
      setData(dash);
      setHistory(hist.items);
      setHistoryCursor(hist.nextCursor);
      historyCount.current = Math.max(HISTORY_PAGE, hist.items.length);
      setReferral(ref);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [authHeaders, loadAgentApplication]);

  async function loadMoreHistory() {
    if (!historyCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<HistoryPage>(`/v1/me/history?limit=${HISTORY_PAGE}&cursor=${historyCursor}`, { headers: authHeaders() });
      setHistory((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        const next = [...prev, ...page.items.filter((row) => !seen.has(row.id))];
        historyCount.current = next.length;
        return next;
      });
      setHistoryCursor(page.nextCursor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const myTrades = useMemo(
    () => data?.myTrades ?? data?.latestEscrows ?? [],
    [data?.myTrades, data?.latestEscrows],
  );
  const tradeWindow = useTradeListWindow(myTrades);

  useEffect(() => {
    syncEscrowIds(myTrades.map((e) => e.id));
  }, [myTrades, syncEscrowIds]);

  useLiveTradeUpdates(load, { enabled: ready && Boolean(user), pollMs: 8_000 });

  useEffect(() => {
    if (!ready || !user) return;
    load();
  }, [ready, user, load]);

  if (!ready || !user) return <p className="muted">{t("Loading dashboard…")}</p>;

  const greetingName = userDisplayLabel(user, t("there"));
  const activeEscrows = data?.stats.activeEscrows ?? 0;
  const walletCount = data?.wallets?.length ?? 0;

  return (
    <div className="page app-dash">
      {err && <p className="error-banner">{err}</p>}

      <section className="card-surface dash-welcome-card">
        <p className="eyebrow">{t("Dashboard")}</p>
        <h1 className="dash-welcome-title">
          {t("Welcome back")},{" "}
          <span className="dash-welcome-name">{greetingName}</span>
        </h1>
        <p className="muted dash-welcome-lede">
          {activeEscrows > 0
            ? t("Good to see you again. Your active escrows are waiting below.")
            : myTrades.length > 0
              ? t("Good to see you again. Jump back into your trades whenever you're ready.")
              : t("Good to see you again. Start a trade or join one with a code when you're ready.")}
        </p>
        <p className="muted dash-welcome-meta">
          {walletCount > 0
            ? `${walletCount} ${t("linked wallet(s)")}`
            : t("Link a wallet on your profile to match escrows to your account.")}
        </p>
        <div className="hero-actions dash-welcome-actions">
          <button type="button" onClick={() => navigate("/trades/new")}>
            {t("Start a trade")}
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/join")}>
            {t("Join a trade")}
          </button>
          <button type="button" className="secondary" onClick={() => navigate("/app/profile")}>
            {t("Profile")}
          </button>
        </div>
      </section>

      <section className="section">
        <h2>{t("My overview")}</h2>
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-label">{t("Active Escrows")}</span>
            <span className="stat-value">{data?.stats.activeEscrows ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t("Total Value Locked")}</span>
            <span className="stat-value">
              {formatAmount(data?.stats.totalValueLockedAtomic || "0")} <small>{t("USDT eq.")}</small>
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t("Completed")}</span>
            <span className="stat-value">{data?.stats.completed ?? 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">{t("In Dispute")}</span>
            <span className="stat-value">{data?.stats.inDispute ?? 0}</span>
          </div>
        </div>
      </section>

      <div className="grid-home">
        <section className="section">
          <div className="section-head">
            <h2>{t("My trades")}</h2>
            <span className="muted">{data?.stats.totalEscrows ?? 0} {t("total")}</span>
          </div>
          {myTrades.length === 0 && (
            <div className="empty card-surface">
              <p>{t("No trades are linked to your profile yet.")}</p>
              <button type="button" onClick={() => navigate("/trades/new")}>
                {t("Start a trade")}
              </button>
              <button type="button" className="secondary" onClick={() => navigate("/join")}>
                {t("Join a trade")}
              </button>
              <button type="button" className="linkish" onClick={() => navigate("/app/profile")}>
                {t("Save a wallet on your profile")}
              </button>
            </div>
          )}
          <ul className="trade-list">
            {tradeWindow.visible.map((e) => (
              <li key={e.id}>
                <button type="button" className="trade-row" onClick={() => navigate(`/trades/${e.id}`)}>
                  <span className="trade-row-main">
                    <strong>{e.title}</strong>
                    <TradePartyBadge escrow={e} userId={user.id} walletAddresses={data?.wallets.map((wallet) => wallet.address)} />
                  </span>
                  <StatusBadge status={e.status} />
                </button>
              </li>
            ))}
          </ul>
          {tradeWindow.showMore && (
            <button type="button" className="secondary trade-list-view-more" onClick={tradeWindow.expand}>
              {t("Click to view more")} ({tradeWindow.hiddenCount})
            </button>
          )}
        </section>

        <section className="section">
          <div className="card-surface referral-promo">
            <p className="eyebrow">{t("Referral program")}</p>
            {!referral?.enrolled ? (
              <>
                <h2>{t("Earn 2% when your traders succeed")}</h2>
                <p className="muted">{t("Share one link. We track commissions and tier status — no wallet required to start.")}</p>
                <button type="button" onClick={() => navigate("/referrals")}>
                  {t("Become a referrer")}
                </button>
              </>
            ) : (
              <>
                <h2>{t("Your referrer stats")}</h2>
                <dl className="kv">
                  <dt>{t("Signups via your link")}</dt>
                  <dd>{referral.referees?.length ?? 0}</dd>
                  <dt>{t("Converted (completed trades)")}</dt>
                  <dd>{referral.successfulReferrals ?? 0}</dd>
                  <dt>{t("Pending payout")}</dt>
                  <dd>{formatAmount(referral.pendingBalanceAtomic || "0")}</dd>
                </dl>
                <button type="button" onClick={() => navigate("/referrals")}>
                  {t("Payouts & cash out")}
                </button>
              </>
            )}
          </div>

          {(data?.user.role ?? user.role) !== "admin" && (
            <section className="card-surface agent-become-promo">
              <p className="eyebrow">{t("Dispute agents")}</p>
              <h2>{t("Become an agent. And earn")}</h2>
              <p className="muted">
                {t("Help resolve disputes after you qualify on completed trade volume. Earn commission on cases you handle.")}
              </p>
              {!agentSectionOpen ? (
                <button type="button" className="primary" onClick={() => setAgentSectionOpen(true)}>
                  {t("View qualification & apply")}
                </button>
              ) : (
                <>
                  <button type="button" className="linkish agent-become-hide" onClick={() => setAgentSectionOpen(false)}>
                    {t("Hide agent details")}
                  </button>
                  <AgentApplicationCard
                    embedded
                    context={agentApply}
                    loading={agentApplyLoading}
                    headers={authHeaders}
                    userRole={data?.user.role ?? user.role}
                    onUpdated={loadAgentApplication}
                  />
                </>
              )}
            </section>
          )}

          <h2 style={{ marginTop: "1.5rem" }}>{t("Transaction history")}</h2>
          {history.length === 0 && <p className="muted">{t("Events from your escrows will show here after activity.")}</p>}
          <ul className="activity-list">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{eventLabel(h.eventName, t)}</strong>
                <span className="muted">
                  {" "}
                  — {h.escrowTitle} · {formatAmount(h.amountAtomic)} {h.tokenSymbol}
                </span>
                {h.explorerTx && (
                  <>
                    {" "}
                    <a href={h.explorerTx} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
          {historyCursor && (
            <button type="button" className="secondary" disabled={loadingMore} onClick={() => void loadMoreHistory()}>
              {loadingMore ? t("Loading…") : t("Load more")}
            </button>
          )}

          <div className="card-surface" style={{ marginTop: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>{t("Need Help?")}</h3>
            <p className="muted">{t("Buyer funds · seller delivers proof · approve 90/10 or open a dispute.")}</p>
            <button type="button" className="secondary" onClick={() => navigate("/")}>
              {t("How it works")}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
