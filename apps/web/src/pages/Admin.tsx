import { useLanguage as useCopyLanguage } from "../lib/language";
import { TranslatedText } from "../lib/language";
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { mainnet } from "viem/chains";
import { escrowDealAbi, escrowFactoryAbi } from "@2pescrow/shared";
import { useLiveTradeUpdates } from "../lib/useLiveTradeUpdates";
import { api, formatAmount, shortAddr } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { StatusBadge } from "../components/StatusBadge";
import type { AdminUserRow, Agent, Dispute, Escrow, FeedbackSubmission, PlatformSettings, WalletConfig } from "../lib/types";
import { BlogCms } from "../components/BlogCms";
import { FaqCms } from "../components/FaqCms";
import { BrandSlot } from "../components/BrandSlot";
import { DEFAULT_FAVICON, DEFAULT_LOGO } from "../lib/brand";
import { ReminderDesk } from "../components/ReminderDesk";
import { usePlatformSettings } from "../lib/platformSettings";
import { useTronWallet } from "../lib/tron/TronWalletContext";
import { TRON_DEAL_ABI, TRON_FACTORY_ABI, tronDealAction } from "../lib/tron/tronLink";
import { ConnectEvmWalletButton } from "../lib/evmWalletPicker";

type AdminSection = "overview" | "analytics" | "users" | "referrers" | "operations" | "platform" | "email" | "site" | "blog" | "faq" | "feedback";

type AnalyticsMonth = {
  month: string;
  newUsers: number;
  referralVisits: number;
  tradesCreated: number;
  tradesFunded: number;
  tradesCompleted: number;
  assets: {
    chain: string;
    tokenSymbol: string;
    fundedVolumeAtomic: string;
    completedVolumeAtomic: string;
    feesAtomic: string;
    creationFeesAtomic: string;
    successfulTradeFeesAtomic: string;
    otherFeesAtomic: string;
    feeEventsCount: number;
    feeEventsReported: number;
    feeEventsMissing: number;
  }[];
};

type AnalyticsReport = {
  generatedAt: string;
  definitions: { feeRevenue: string; referralVisits: string; amounts: string };
  months: AnalyticsMonth[];
};

type AnalyticsAssetTotals = {
  chain: string;
  tokenSymbol: string;
  fundedVolumeAtomic: bigint;
  completedVolumeAtomic: bigint;
  feesAtomic: bigint;
  creationFeesAtomic: bigint;
  successfulTradeFeesAtomic: bigint;
  otherFeesAtomic: bigint;
  feeEventsCount: number;
  feeEventsReported: number;
  feeEventsMissing: number;
};

function analyticsAssetTotals(rows: AnalyticsMonth[]): AnalyticsAssetTotals[] {
  const totals = new Map<string, AnalyticsAssetTotals>();
  for (const month of rows) for (const asset of month.assets) {
    const key = `${asset.chain}:${asset.tokenSymbol}`;
    const total = totals.get(key) ?? {
      chain: asset.chain,
      tokenSymbol: asset.tokenSymbol,
      fundedVolumeAtomic: 0n,
      completedVolumeAtomic: 0n,
      feesAtomic: 0n,
      creationFeesAtomic: 0n,
      successfulTradeFeesAtomic: 0n,
      otherFeesAtomic: 0n,
      feeEventsCount: 0,
      feeEventsReported: 0,
      feeEventsMissing: 0,
    };
    total.fundedVolumeAtomic += BigInt(asset.fundedVolumeAtomic);
    total.completedVolumeAtomic += BigInt(asset.completedVolumeAtomic);
    total.feesAtomic += BigInt(asset.feesAtomic);
    total.creationFeesAtomic += BigInt(asset.creationFeesAtomic);
    total.successfulTradeFeesAtomic += BigInt(asset.successfulTradeFeesAtomic);
    total.otherFeesAtomic += BigInt(asset.otherFeesAtomic);
    total.feeEventsCount += asset.feeEventsCount;
    total.feeEventsReported += asset.feeEventsReported;
    total.feeEventsMissing += asset.feeEventsMissing;
    totals.set(key, total);
  }
  return [...totals.values()].sort((a, b) => `${a.chain}:${a.tokenSymbol}`.localeCompare(`${b.chain}:${b.tokenSymbol}`));
}

function AnalyticsMonthlyChart({
  rows,
  metric,
  title,
  limit,
}: {
  rows: AnalyticsMonth[];
  metric: "completedVolumeAtomic" | "feesAtomic" | "creationFeesAtomic" | "successfulTradeFeesAtomic" | "otherFeesAtomic";
  title: string;
  limit: number;
}) {
  const chartRows = rows.slice(-limit);
  const assets = analyticsAssetTotals(chartRows);
  if (!assets.length) return <section className="admin-analytics-chart"><h3>{title}</h3><p className="muted"><TranslatedText text={"No indexed on-chain amount data for this period."} /></p></section>;
  return (
    <section className="admin-analytics-chart">
      <h3>{title}</h3>
      {assets.map((asset) => {
        const max = chartRows.reduce((largest, month) => {
          const value = BigInt(month.assets.find((row) => row.chain === asset.chain && row.tokenSymbol === asset.tokenSymbol)?.[metric] ?? "0");
          return value > largest ? value : largest;
        }, 0n);
        const cellWidth = 640 / Math.max(chartRows.length, 1);
        const barWidth = Math.min(28, cellWidth * 0.58);
        return (
          <div className="admin-analytics-series" key={`${asset.chain}:${asset.tokenSymbol}`}>
            <strong>{asset.chain} · {asset.tokenSymbol}</strong>
            <svg viewBox="0 0 680 160" role="img" aria-label={`${title} for ${asset.chain} ${asset.tokenSymbol}`}>
              <line x1="28" x2="666" y1="122" y2="122" className="analytics-axis" />
              {chartRows.map((month, index) => {
                const atomic = BigInt(month.assets.find((row) => row.chain === asset.chain && row.tokenSymbol === asset.tokenSymbol)?.[metric] ?? "0");
                const height = max > 0n ? Number((atomic * 1000n) / max) / 1000 * 92 : 0;
                const x = 34 + index * cellWidth + (cellWidth - barWidth) / 2;
                return (
                  <g key={month.month}>
                    <title>{`${month.month}: ${formatAmount(atomic)} ${asset.tokenSymbol}`}</title>
                    <rect x={x} y={122 - height} width={barWidth} height={height} rx="3" className="analytics-bar" />
                    <text x={x + barWidth / 2} y="145" textAnchor="middle">{month.month.slice(5)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </section>
  );
}

function AdminOverviewFinancials({ headers }: { headers: () => Record<string, string> }) {
  const { t: localizeCopy } = useCopyLanguage();
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<AnalyticsReport>("/v1/admin/analytics", { headers: headers() })
      .then((data) => { if (alive) setReport(data); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [headers]);

  if (error) return <section className="card-surface"><h2><TranslatedText text={"Trade volume & platform earnings"} /></h2><p className="error-banner"><TranslatedText text={error} /></p></section>;
  if (!report) return <section className="card-surface"><h2><TranslatedText text={"Trade volume & platform earnings"} /></h2><p className="muted"><TranslatedText text={"Loading indexed on-chain totals…"} /></p></section>;

  const assets = analyticsAssetTotals(report.months);
  const totals = report.months.reduce((sum, month) => ({
    funded: sum.funded + month.tradesFunded,
    completed: sum.completed + month.tradesCompleted,
  }), { funded: 0, completed: 0 });
  return (
    <section className="card-surface admin-overview-financials">
      <div>
        <h2><TranslatedText text={"Trade volume & platform earnings"} /></h2>
        <p className="muted"><TranslatedText text={"All-time indexed totals, with fee revenue broken out by the month it was recorded. Amounts stay separated by network and token."} /></p>
      </div>
      <div className="admin-stat-row">
        <div className="admin-stat-chip"><span className="muted"><TranslatedText text={"Funded trades"} /></span><strong>{totals.funded.toLocaleString()}</strong></div>
        <div className="admin-stat-chip"><span className="muted"><TranslatedText text={"Completed / resolved"} /></span><strong>{totals.completed.toLocaleString()}</strong></div>
        {assets.map((asset) => <div className="admin-stat-chip" key={`completed:${asset.chain}:${asset.tokenSymbol}`}>
          <span className="muted"><TranslatedText text={"Completed amount ·"} /> {asset.chain} · {asset.tokenSymbol}</span>
          <strong>{formatAmount(asset.completedVolumeAtomic)} {asset.tokenSymbol}</strong>
        </div>)}
        {assets.map((asset) => <div className="admin-stat-chip" key={`creation-fees:${asset.chain}:${asset.tokenSymbol}`}>
          <span className="muted"><TranslatedText text={"Creation fees ($1 per funded trade) ·"} /> {asset.chain} · {asset.tokenSymbol}</span>
          <strong>{formatAmount(asset.creationFeesAtomic)} {asset.tokenSymbol}</strong>
        </div>)}
        {assets.map((asset) => <div className="admin-stat-chip" key={`success-fees:${asset.chain}:${asset.tokenSymbol}`}>
          <span className="muted"><TranslatedText text={"Successful trade fees (10%) ·"} /> {asset.chain} · {asset.tokenSymbol}</span>
          <strong>{formatAmount(asset.successfulTradeFeesAtomic)} {asset.tokenSymbol}</strong>
        </div>)}
        {assets.map((asset) => <div className="admin-stat-chip" key={`fees:${asset.chain}:${asset.tokenSymbol}`}>
          <span className="muted"><TranslatedText text={"Gross platform fees ·"} /> {asset.chain} · {asset.tokenSymbol}</span>
          <strong>{formatAmount(asset.feesAtomic)} {asset.tokenSymbol}</strong>
          <span className="muted"><TranslatedText text={"Other/cancellation fees:"} /> {formatAmount(asset.otherFeesAtomic)} {asset.tokenSymbol}</span>
          <span className="muted"><TranslatedText text={"Fee fields reported:"} /> {asset.feeEventsReported}/{asset.feeEventsCount}{asset.feeEventsMissing > 0 ? ` · ${asset.feeEventsMissing} missing` : ""}</span>
        </div>)}
      </div>
      <AnalyticsMonthlyChart rows={report.months} metric="completedVolumeAtomic" title={localizeCopy("Completed trade amount · recent months")} limit={6} />
      <AnalyticsMonthlyChart rows={report.months} metric="successfulTradeFeesAtomic" title={localizeCopy("Successful trade fees (10%) · recent months")} limit={6} />
      <AnalyticsMonthlyChart rows={report.months} metric="creationFeesAtomic" title={localizeCopy("Creation fees ($1 per funded trade) · recent months")} limit={6} />
      <p className="hint"><TranslatedText text={"Successful trade fees are the contract fee transferred when funds are released to the seller (or resolved in the seller’s favor). Creation fees are charged when funding succeeds. Gross fees are before referral commission liabilities; missing fee payloads are excluded and shown in the coverage count."} /></p>
    </section>
  );
}

type ReferrerRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  referralCode: string;
  tier: string;
  pendingBalanceAtomic: string;
  totalEarnedAtomic: string;
  totalPaidAtomic: string;
  successfulReferrals: number;
  pendingCommissionCount: number;
};

type PayoutRow = {
  id: string;
  status: string;
  amountAtomic: string;
  payoutAddress: string;
  payoutChain: string;
  createdAt: string;
  adminNote?: string | null;
  referrer: {
    email: string | null;
    displayName: string | null;
    tier: string;
    successfulReferrals: number;
    pendingBalanceAtomic: string;
  };
};

const ACTIVE_DISPUTE_STATUSES = ["open", "ruled_pending_appeal", "appealed", "appeal_decided", "final_ruling"] as const;

function activeDisputeForEscrow(escrow: Escrow): Dispute | undefined {
  return (
    escrow.disputes?.find((d) => (ACTIVE_DISPUTE_STATUSES as readonly string[]).includes(d.status)) || escrow.disputes?.[0]
  );
}

function hasResolverFreezeRecord(escrow: Escrow, dispute: Dispute): boolean {
  return Boolean(escrow.events?.some((event) =>
    event.eventName === "DisputeFreezeConfirmed"
    && event.payload?.disputeId === dispute.id,
  ));
}

function clientCanFinalizePayout(dispute: Dispute) {
  if (dispute.buyerFavor == null) return false;
  if (dispute.status === "appealed") return false;
  if (dispute.status === "ruled_pending_appeal") {
    if (!dispute.appealDeadlineAt) return false;
    return new Date(dispute.appealDeadlineAt).getTime() <= Date.now();
  }
  return dispute.status === "appeal_decided" || dispute.status === "final_ruling";
}

const NAV: { id: AdminSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics & exports" },
  { id: "users", label: "Users" },
  { id: "referrers", label: "Referrers & payouts" },
  { id: "operations", label: "Disputes & agents" },
  { id: "platform", label: "Escrow platform" },
  { id: "email", label: "Email (SMTP)" },
  { id: "site", label: "Site & SEO" },
  { id: "blog", label: "Blog" },
  { id: "faq", label: "FAQ" },
  { id: "feedback", label: "Feedback" },
];

function AdminAnalyticsReport({ headers }: { headers: () => Record<string, string> }) {
  const { t: localizeCopy } = useCopyLanguage();
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [range, setRange] = useState<"all" | "12" | "60">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api<AnalyticsReport>("/v1/admin/analytics", { headers: headers() })
      .then((data) => { if (alive) setReport(data); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [headers]);

  const rows = (() => {
    if (!report) return [];
    const months = range === "all" ? report.months : report.months.slice(-Number(range));
    return months;
  })();
  const sums = rows.reduce((sum, row) => ({
    signups: sum.signups + row.newUsers,
    visits: sum.visits + row.referralVisits,
    funded: sum.funded + row.tradesFunded,
    completed: sum.completed + row.tradesCompleted,
  }), { signups: 0, visits: 0, funded: 0, completed: 0 });
  const assetTotals = analyticsAssetTotals(rows);

  function exportCsv() {
    if (!report) return;
    const csvRows: unknown[][] = [["Month", "Signups", "Referral visits", "Trades created", "Trades funded", "Trades completed or dispute resolved", "Network", "Token", "Funded escrow amount", "Completed trade amount", "Creation fees ($1 per funded trade)", "Successful trade fees (10%)", "Other fees", "Gross platform fees reported", "Fee events with reported fees", "Fee events missing fee data"]];
    for (const month of rows) {
      if (!month.assets.length) csvRows.push([month.month, month.newUsers, month.referralVisits, month.tradesCreated, month.tradesFunded, month.tradesCompleted, "", "", "", "", "", "", "", "", "", ""]);
      for (const asset of month.assets) csvRows.push([
        month.month,
        month.newUsers,
        month.referralVisits,
        month.tradesCreated,
        month.tradesFunded,
        month.tradesCompleted,
        asset.chain,
        asset.tokenSymbol,
        formatAmount(asset.fundedVolumeAtomic),
        formatAmount(asset.completedVolumeAtomic),
        formatAmount(asset.creationFeesAtomic),
        formatAmount(asset.successfulTradeFeesAtomic),
        formatAmount(asset.otherFeesAtomic),
        formatAmount(asset.feesAtomic),
        asset.feeEventsReported,
        asset.feeEventsMissing,
      ]);
    }
    for (const asset of assetTotals) csvRows.push([
      `Range total (${range === "all" ? "all-time" : `last ${range} months`})`,
      "", "", "", "", "",
      asset.chain,
      asset.tokenSymbol,
      formatAmount(asset.fundedVolumeAtomic),
      formatAmount(asset.completedVolumeAtomic),
      formatAmount(asset.creationFeesAtomic),
      formatAmount(asset.successfulTradeFeesAtomic),
      formatAmount(asset.otherFeesAtomic),
      formatAmount(asset.feesAtomic),
      asset.feeEventsReported,
      asset.feeEventsMissing,
    ]);
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const content = `\uFEFF${csvRows.map((row) => row.map(escape).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `2pescrow-investor-report-${range === "all" ? "all-time" : `last-${range}-months`}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card-surface">
      <div className="admin-report-head">
        <div>
          <h2><TranslatedText text={"Platform analytics"} /></h2>
          <p className="muted"><TranslatedText text={"Monthly activity and the platform’s two key fees: $1 when each trade is funded and 10% when a successful trade is paid out."} /></p>
        </div>
        <div className="hero-actions">
          <select aria-label={localizeCopy("Analytics date range")} value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
            <option value="all"><TranslatedText text={"All recorded history"} /></option>
            <option value="60"><TranslatedText text={"Last 5 years"} /></option>
            <option value="12"><TranslatedText text={"Last 12 months"} /></option>
          </select>
          <button type="button" className="primary" onClick={exportCsv} disabled={!report}><TranslatedText text={"Export CSV for Excel"} /></button>
        </div>
      </div>
      {loading && <p className="muted"><TranslatedText text={"Loading analytics…"} /></p>}
      {error && <p className="error-banner"><TranslatedText text={error} /></p>}
      {report && <>
        <div className="admin-stat-row">
          <div className="admin-stat-chip"><span className="muted"><TranslatedText text={"New signups"} /></span><strong>{sums.signups.toLocaleString()}</strong></div>
          <div className="admin-stat-chip"><span className="muted"><TranslatedText text={"Referral visits"} /></span><strong>{sums.visits.toLocaleString()}</strong></div>
          <div className="admin-stat-chip"><span className="muted"><TranslatedText text={"Funded trades"} /></span><strong>{sums.funded.toLocaleString()}</strong></div>
          <div className="admin-stat-chip"><span className="muted"><TranslatedText text={"Completed / resolved trades"} /></span><strong>{sums.completed.toLocaleString()}</strong></div>
          {assetTotals.map((asset) => <div className="admin-stat-chip" key={`funded:${asset.chain}:${asset.tokenSymbol}`}>
            <span className="muted"><TranslatedText text={"Funded amount ·"} /> {asset.chain} · {asset.tokenSymbol}</span><strong>{formatAmount(asset.fundedVolumeAtomic)} {asset.tokenSymbol}</strong>
          </div>)}
          {assetTotals.map((asset) => <div className="admin-stat-chip" key={`completed:${asset.chain}:${asset.tokenSymbol}`}>
            <span className="muted"><TranslatedText text={"Completed amount ·"} /> {asset.chain} · {asset.tokenSymbol}</span><strong>{formatAmount(asset.completedVolumeAtomic)} {asset.tokenSymbol}</strong>
          </div>)}
          {assetTotals.map((asset) => <div className="admin-stat-chip" key={`creation-fees:${asset.chain}:${asset.tokenSymbol}`}>
            <span className="muted"><TranslatedText text={"Creation fees ($1 per funded trade) ·"} /> {asset.chain} · {asset.tokenSymbol}</span><strong>{formatAmount(asset.creationFeesAtomic)} {asset.tokenSymbol}</strong>
          </div>)}
          {assetTotals.map((asset) => <div className="admin-stat-chip" key={`success-fees:${asset.chain}:${asset.tokenSymbol}`}>
            <span className="muted"><TranslatedText text={"Successful trade fees (10%) ·"} /> {asset.chain} · {asset.tokenSymbol}</span><strong>{formatAmount(asset.successfulTradeFeesAtomic)} {asset.tokenSymbol}</strong>
          </div>)}
          {assetTotals.map((asset) => <div className="admin-stat-chip" key={`fees:${asset.chain}:${asset.tokenSymbol}`}>
            <span className="muted"><TranslatedText text={"Gross platform fees ·"} /> {asset.chain} · {asset.tokenSymbol}</span><strong>{formatAmount(asset.feesAtomic)} {asset.tokenSymbol}</strong>
            <span className="muted"><TranslatedText text={"Other/cancellation fees:"} /> {formatAmount(asset.otherFeesAtomic)} {asset.tokenSymbol}</span>
            <span className="muted"><TranslatedText text={"Fee fields reported:"} /> {asset.feeEventsReported}/{asset.feeEventsCount}{asset.feeEventsMissing > 0 ? ` · ${asset.feeEventsMissing} missing` : ""}</span>
          </div>)}
        </div>
        <p className="hint"><TranslatedText text={"The Month column is when the platform recorded each on-chain event (UTC). The $1 creation fee is counted in the month the trade is funded; the 10% successful-trade fee is counted in the month funds are released or a dispute is resolved in the seller’s favor. Amounts are grouped by Ethereum or Tron and token. Missing fee data is excluded and counted, so historical totals may be incomplete."} /></p>
        <div className="admin-analytics-chart-grid">
          <AnalyticsMonthlyChart rows={rows} metric="completedVolumeAtomic" title={localizeCopy("Completed trade amount by month")} limit={12} />
          <AnalyticsMonthlyChart rows={rows} metric="successfulTradeFeesAtomic" title={localizeCopy("Successful trade fees (10%) by month")} limit={12} />
          <AnalyticsMonthlyChart rows={rows} metric="creationFeesAtomic" title={localizeCopy("Creation fees ($1 per funded trade) by month")} limit={12} />
          <AnalyticsMonthlyChart rows={rows} metric="feesAtomic" title={localizeCopy("Reported gross platform fees by month")} limit={12} />
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th><TranslatedText text={"Month"} /></th><th><TranslatedText text={"Signups"} /></th><th><TranslatedText text={"Referral visits"} /></th><th><TranslatedText text={"Created"} /></th><th><TranslatedText text={"Funded"} /></th><th><TranslatedText text={"Completed / resolved"} /></th><th><TranslatedText text={"Network / token"} /></th><th><TranslatedText text={"Funded amount"} /></th><th><TranslatedText text={"Completed amount"} /></th><th><TranslatedText text={"Creation fees ($1)"} /></th><th><TranslatedText text={"Successful trade fees (10%)"} /></th><th><TranslatedText text={"Other fees"} /></th><th><TranslatedText text={"Gross fees reported"} /></th><th><TranslatedText text={"Fee fields reported"} /></th><th><TranslatedText text={"Fee fields missing"} /></th></tr></thead>
            <tbody>{rows.slice().reverse().map((month) => month.assets.length
              ? month.assets.map((asset, index) => <tr key={`${month.month}-${asset.chain}-${asset.tokenSymbol}`}>
                  <td>{index === 0 ? month.month : ""}</td><td>{index === 0 ? month.newUsers : ""}</td><td>{index === 0 ? month.referralVisits : ""}</td><td>{index === 0 ? month.tradesCreated : ""}</td><td>{index === 0 ? month.tradesFunded : ""}</td><td>{index === 0 ? month.tradesCompleted : ""}</td>
                  <td>{asset.chain} · {asset.tokenSymbol}</td><td>{formatAmount(asset.fundedVolumeAtomic)} {asset.tokenSymbol}</td><td>{formatAmount(asset.completedVolumeAtomic)} {asset.tokenSymbol}</td><td>{formatAmount(asset.creationFeesAtomic)} {asset.tokenSymbol}</td><td>{formatAmount(asset.successfulTradeFeesAtomic)} {asset.tokenSymbol}</td><td>{formatAmount(asset.otherFeesAtomic)} {asset.tokenSymbol}</td><td>{formatAmount(asset.feesAtomic)} {asset.tokenSymbol}</td><td>{asset.feeEventsReported}/{asset.feeEventsCount}</td><td>{asset.feeEventsMissing}</td>
                </tr>)
              : <tr key={month.month}><td>{month.month}</td><td>{month.newUsers}</td><td>{month.referralVisits}</td><td>{month.tradesCreated}</td><td>{month.tradesFunded}</td><td>{month.tradesCompleted}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>0/0</td><td>0</td></tr>
            )}</tbody>
          </table>
        </div>
      </>}
    </section>
  );
}

export function AdminPage() {
  const { t: localizeCopy } = useCopyLanguage();
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { navigate } = useRouter();
  const { user, loading, authHeaders, signOut } = useAuth();
  const { writeContractAsync } = useWriteContract();
  const { refresh: refreshPlatformSettings } = usePlatformSettings();
  const tron = useTronWallet();

  const [section, setSection] = useState<AdminSection>("overview");
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [cfg, setCfg] = useState<WalletConfig | null>(null);
  const [disputed, setDisputed] = useState<Escrow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [payoutQueue, setPayoutQueue] = useState<PayoutRow[]>([]);
  const [pendingPayoutCount, setPendingPayoutCount] = useState(0);
  const [payoutFilter, setPayoutFilter] = useState<"pending" | "sent" | "rejected" | "all">("pending");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [accessDraft, setAccessDraft] = useState<Record<string, { moderator: boolean; disputes: boolean; blog: boolean; email: boolean }>>({});
  const [savingAccessId, setSavingAccessId] = useState<string | null>(null);
  const [editingAccessId, setEditingAccessId] = useState<string | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackSubmission[]>([]);
  const [feedbackFilter, setFeedbackFilter] = useState<"new" | "reviewed" | "archived" | "all">("new");
  const [newFeedbackCount, setNewFeedbackCount] = useState(0);
  const [apiHealth, setApiHealth] = useState<{ ok: boolean; chainId?: number } | null | undefined>(undefined);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [disputeModerators, setDisputeModerators] = useState<{ id: string; email: string | null; displayName: string | null }[]>([]);
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({});
  const [assigningDisputeId, setAssigningDisputeId] = useState<string | null>(null);
  const [agentActivity, setAgentActivity] = useState<
    { id: string; action: string; summary: string; escrowId?: string | null; disputeId?: string | null; createdAt: string; agent?: { email: string | null; displayName: string | null } }[]
  >([]);
  const [agentApplications, setAgentApplications] = useState<
    {
      id: string;
      status: string;
      applicantNote?: string | null;
      volumeAtomicAtApply: string;
      createdAt: string;
      user: { id: string; email: string | null; displayName: string | null; role: string };
    }[]
  >([]);
  const [referralLeaderboard, setReferralLeaderboard] = useState<
    { rank: number; displayLabel: string; tier: string; totalEarnedAtomic: string; successfulReferrals: number }[]
  >([]);
  const [decidingApplicationId, setDecidingApplicationId] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState({ walletAddress: "", displayName: "", feeBps: "500" });
  const [commissionAgents, setCommissionAgents] = useState<{
    userId: string;
    email: string | null;
    accountName: string | null;
    finalizedCaseCount: number;
    profile: { displayName: string; commissionBps: number | null; effectiveBps: number; coolingOffEndsAt: string; payoutAddress: string | null } | null;
  }[]>([]);
  const [agentPayouts, setAgentPayouts] = useState<{
    id: string;
    amountAtomic: string;
    profile: { displayName: string; payoutAddress: string | null; payoutChain: string | null };
  }[]>([]);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [coolingDraft, setCoolingDraft] = useState<Record<string, string>>({});
  const [settingsForm, setSettingsForm] = useState({
    feeRecipientWallet: "",
    resolutionMode: "admin",
    factoryAddress: "",
    agentModeEnabled: false,
    tronSupportEnabled: false,
    tronUsdtAddress: "",
    tronFactoryAddress: "",
    tronFeeRecipientWallet: "",
    tronResolverWallet: "",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    smtpSecure: false,
    siteTitle: "",
    siteLogoUrl: "",
    siteFaviconUrl: "",
    metaDescription: "",
    metaKeywords: "",
    feedbackEnabled: false,
    referralLeaderboardEnabled: false,
    mobileAppsEnabled: false,
    iosAppStoreUrl: "",
    androidPlayStoreUrl: "",
    telegramUrl: "",
    xUrl: "",
    discordUrl: "",
    remindersEnabled: false,
    reminderEmailSubject: "",
    reminderEmailBody: "",
    siteNoticeEnabled: true,
    siteNoticeTitle: "Wallet connection help",
    siteNoticeBody: "For the full 2Pescrow experience, connect a supported wallet before starting a trade. A connected wallet is required to fund escrow and complete on-chain actions.\n\nIf wallet connection is slow on mobile, try opening 2Pescrow in your wallet’s built-in browser or in a desktop browser. If your network route is causing delays, a VPN may help reduce connection latency.",
    siteNoticeAudience: "all" as "all" | "mobile" | "desktop",
    siteNoticeDelaySeconds: 15,
    disputeAppealMessage: "A provisional ruling favored {favoredParty}. You may appeal within {appealDays} days. Log in and return to this trade to submit your appeal before {appealDeadline}. Trade: {tradeUrl}",
    disputeFinalMessage: "A final ruling favored {favoredParty}. This ruling is final and the appeal window is closed. Trade: {tradeUrl}",
    disputeEmailNotificationsEnabled: true,
    disputeAppealEmailSubject: "A ruling is ready for appeal",
    disputeFinalEmailSubject: "Final dispute ruling",
    disputeAppealDecisionMessage: "The appeal for {tradeTitle} has been reviewed. The final ruling favors {favoredParty}. Trade: {tradeUrl}",
    disputeAppealDecisionEmailSubject: "Your dispute appeal has been decided",
  });
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [emailUserSearch, setEmailUserSearch] = useState("");
  const [emailRecipients, setEmailRecipients] = useState<{ id: string; email: string; displayName: string | null }[]>([]);
  const [selectedEmailRecipientId, setSelectedEmailRecipientId] = useState("");
  const [emailMessageSubject, setEmailMessageSubject] = useState("");
  const [emailMessageBody, setEmailMessageBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);

  const headers = useCallback(() => authHeaders(), [authHeaders]);
  const isSuper = user?.role === "admin";
  const isDisputeAgent = user?.role === "agent" && !!user.permissions?.includes("disputes");
  const canDisputes = isSuper || isDisputeAgent || (user?.role === "moderator" && !!user.permissions?.includes("disputes"));
  const canBlog = isSuper || (user?.role === "moderator" && !!user.permissions?.includes("blog"));
  const canEmail = isSuper || (user?.role === "moderator" && !!user.permissions?.includes("email"));
  const visibleNav = NAV.filter((item) => {
    if (isSuper) return true;
    if (item.id === "overview") return true;
    if (item.id === "operations") return canDisputes;
    if (item.id === "blog") return canBlog;
    if (item.id === "email") return canEmail;
    return false;
  });

  const applySettingsForm = useCallback((s: PlatformSettings) => {
    setSettingsForm({
      feeRecipientWallet: s.feeRecipientWallet || "",
      resolutionMode: s.resolutionMode || "admin",
      factoryAddress: s.factoryAddress || "",
      agentModeEnabled: s.agentModeEnabled ?? false,
      tronSupportEnabled: s.tronSupportEnabled ?? false,
      tronUsdtAddress: s.tronUsdtAddress || "",
      tronFactoryAddress: s.tronFactoryAddress || "",
      tronFeeRecipientWallet: s.tronFeeRecipientWallet || "",
      tronResolverWallet: s.tronResolverWallet || "",
      smtpHost: s.smtpHost || "",
      smtpPort: String(s.smtpPort ?? 587),
      smtpUser: s.smtpUser || "",
      smtpPass: "",
      smtpFrom: s.smtpFrom || "",
      smtpSecure: s.smtpSecure ?? false,
      siteTitle: s.siteTitle || "",
      siteLogoUrl: s.siteLogoUrl || "",
      siteFaviconUrl: s.siteFaviconUrl || "",
      metaDescription: s.metaDescription || "",
      metaKeywords: s.metaKeywords || "",
      feedbackEnabled: s.feedbackEnabled ?? false,
      referralLeaderboardEnabled: s.referralLeaderboardEnabled ?? false,
      mobileAppsEnabled: s.mobileAppsEnabled ?? false,
      iosAppStoreUrl: s.iosAppStoreUrl || "",
      androidPlayStoreUrl: s.androidPlayStoreUrl || "",
      telegramUrl: s.telegramUrl || "",
      xUrl: s.xUrl || "",
      discordUrl: s.discordUrl || "",
      remindersEnabled: s.remindersEnabled ?? false,
      reminderEmailSubject: s.reminderEmailSubject || "",
      reminderEmailBody: s.reminderEmailBody || "",
      siteNoticeEnabled: s.siteNoticeEnabled ?? true,
      siteNoticeTitle: s.siteNoticeTitle || "Wallet connection help",
      siteNoticeBody: s.siteNoticeBody || "",
      siteNoticeAudience: s.siteNoticeAudience || "all",
      siteNoticeDelaySeconds: s.siteNoticeDelaySeconds ?? 15,
      disputeAppealMessage: s.disputeAppealMessage || "",
      disputeFinalMessage: s.disputeFinalMessage || "",
      disputeEmailNotificationsEnabled: s.disputeEmailNotificationsEnabled ?? true,
      disputeAppealEmailSubject: s.disputeAppealEmailSubject || "A ruling is ready for appeal",
      disputeFinalEmailSubject: s.disputeFinalEmailSubject || "Final dispute ruling",
      disputeAppealDecisionMessage: s.disputeAppealDecisionMessage || "",
      disputeAppealDecisionEmailSubject: s.disputeAppealDecisionEmailSubject || "Your dispute appeal has been decided",
    });
    setSmtpPassConfigured(!!s.smtpPassConfigured);
  }, []);

  const refresh = useCallback(async () => {
    const h = headers();
    const warnings: string[] = [];

    async function tryLoad<T>(label: string, path: string, opts?: RequestInit): Promise<T | null> {
      try {
        return await api<T>(path, { ...opts, headers: { ...h, ...opts?.headers } });
      } catch (e) {
        warnings.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      }
    }

    const [health, s, c, ag, refs, queue, pendingOnly, feedback, feedbackNew] = await Promise.all([
      tryLoad<{ ok: boolean; chainId?: number }>("API health", "/health"),
      isSuper || canEmail ? tryLoad<PlatformSettings>("Settings", "/v1/admin/settings") : Promise.resolve(null),
      isSuper ? tryLoad<WalletConfig>("Wallet config", "/v1/config/wallets") : Promise.resolve(null),
      isSuper ? tryLoad<Agent[]>("Agents", "/v1/agents") : Promise.resolve(null),
      isSuper ? tryLoad<ReferrerRow[]>("Referrers", "/v1/admin/referrals") : Promise.resolve(null),
      isSuper ? tryLoad<PayoutRow[]>("Payout queue", `/v1/admin/referral-payout-requests?status=${payoutFilter}`) : Promise.resolve(null),
      isSuper ? tryLoad<PayoutRow[]>("Pending payouts", "/v1/admin/referral-payout-requests?status=pending") : Promise.resolve(null),
      isSuper ? tryLoad<FeedbackSubmission[]>("Feedback", `/v1/admin/feedback?status=${feedbackFilter}`) : Promise.resolve(null),
      isSuper ? tryLoad<FeedbackSubmission[]>("New feedback", "/v1/admin/feedback?status=new") : Promise.resolve(null),
    ]);

    setApiHealth(health);
    if (s) {
      setSettings(s);
      applySettingsForm(s);
    }
    if (c) setCfg(c);
    if (ag) setAgents(ag);
    if (refs) setReferrers(refs);
    if (queue) setPayoutQueue(queue);
    if (pendingOnly) setPendingPayoutCount(pendingOnly.length);
    if (feedback) setFeedbackItems(feedback);
    if (feedbackNew) setNewFeedbackCount(feedbackNew.length);

    if (isSuper || canDisputes) {
      const openDisputes = await tryLoad<Escrow[]>("Disputes", "/v1/admin/disputes");
      if (openDisputes) setDisputed(openDisputes);
    }
    if (isSuper) {
      const mods = await tryLoad<{ id: string; email: string | null; displayName: string | null }[]>("Moderators", "/v1/admin/moderators");
      if (mods) setDisputeModerators(mods);
      const feed = await tryLoad<typeof agentActivity>("Agent activity", "/v1/admin/agent-activity?limit=40");
      if (feed) setAgentActivity(feed);
      const apps = await tryLoad<typeof agentApplications>("Agent applications", "/v1/admin/agent-applications?status=pending");
      if (apps) setAgentApplications(apps);
      const book = await tryLoad<{
        agents: typeof commissionAgents;
        pendingPayouts: typeof agentPayouts;
      }>("Agent commissions", "/v1/admin/agent-commissions");
      if (book) {
        setCommissionAgents(book.agents);
        setAgentPayouts(book.pendingPayouts);
      }
      if (s?.referralLeaderboardEnabled) {
        const board = await tryLoad<{ entries: typeof referralLeaderboard }>("Referral leaderboard", "/v1/admin/referral-leaderboard");
        setReferralLeaderboard(board?.entries ?? []);
      } else {
        setReferralLeaderboard([]);
      }
    }

    setLoadWarnings(warnings);
    if (warnings.length === 0) setErr(null);
    else if ((isSuper || canEmail) && !s) setErr(warnings.join(" · "));
  }, [headers, applySettingsForm, payoutFilter, feedbackFilter, isSuper, canEmail, canDisputes]);

  const loadUsers = useCallback(
    async (q: string) => {
      const term = q.trim();
      const path = term ? `/v1/admin/users?q=${encodeURIComponent(term)}` : "/v1/admin/users";
      try {
        setUsers(await api<AdminUserRow[]>(path, { headers: headers() }));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    },
    [headers]
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/sys/login");
      return;
    }
    const disputeAgent = user.role === "agent" && !!user.permissions?.includes("disputes");
    if (user.role !== "admin" && user.role !== "moderator" && !disputeAgent) {
      navigate(user.role === "agent" ? "/app" : "/sys/login");
      return;
    }
    refresh().catch((e) => setErr(String(e)));
  }, [loading, user, navigate, refresh]);

  const loadDisputes = useCallback(async () => {
    try {
      setDisputed(await api<Escrow[]>("/v1/admin/disputes", { headers: headers() }));
    } catch {
      /* A full refresh reports API errors. Live updates only refresh the dispute list. */
    }
  }, [headers]);

  useLiveTradeUpdates(() => {
    loadDisputes().catch(() => undefined);
  }, { enabled: canDisputes });

  useEffect(() => {
    if (!user || user.role === "admin") return;
    if (!visibleNav.some((item) => item.id === section)) setSection("overview");
  }, [user, section, visibleNav]);

  useEffect(() => {
    if (section !== "users" || !user || user.role !== "admin") return;
    const t = window.setTimeout(() => loadUsers(userSearch), 300);
    return () => window.clearTimeout(t);
  }, [section, userSearch, loadUsers, user]);

  async function putSettings(body: Record<string, unknown>, successMsg: string) {
    setErr(null);
    try {
      await api("/v1/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify(body),
      });
      setMsg(successMsg);
      await refreshPlatformSettings();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function savePlatformSettings() {
    await putSettings(
      {
        feeRecipientWallet: settingsForm.feeRecipientWallet,
        resolutionMode: settingsForm.resolutionMode as "admin" | "agent",
        factoryAddress: settingsForm.factoryAddress || undefined,
        agentModeEnabled: settingsForm.agentModeEnabled,
        tronSupportEnabled: settingsForm.tronSupportEnabled,
        tronUsdtAddress: settingsForm.tronUsdtAddress || undefined,
        tronFactoryAddress: settingsForm.tronFactoryAddress || undefined,
        tronFeeRecipientWallet: settingsForm.tronFeeRecipientWallet || undefined,
        tronResolverWallet: settingsForm.tronResolverWallet || undefined,
      },
      "Platform settings saved."
    );
  }

  async function setTronSupportEnabled(enabled: boolean) {
    setErr(null);
    try {
      await api("/v1/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ tronSupportEnabled: enabled }),
      });
      setSettingsForm((current) => ({ ...current, tronSupportEnabled: enabled }));
      setMsg(enabled ? "New TRC-20 trades enabled." : "New TRC-20 trades disabled. Existing trades remain manageable.");
      await refreshPlatformSettings();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveDisputeMessages() {
    for (const [label, value, maximum] of [
      ["Appeal email subject", settingsForm.disputeAppealEmailSubject, 180],
      ["Appeal message", settingsForm.disputeAppealMessage, 4000],
      ["Final ruling subject", settingsForm.disputeFinalEmailSubject, 180],
      ["Final ruling message", settingsForm.disputeFinalMessage, 4000],
      ["Appeal decision subject", settingsForm.disputeAppealDecisionEmailSubject, 180],
      ["Appeal decision message", settingsForm.disputeAppealDecisionMessage, 4000],
    ] as const) {
      if (!value.trim() || value.length > maximum) {
        setErr(`${label} must contain 1–${maximum} characters.`);
        return;
      }
    }
    await putSettings({
      disputeEmailNotificationsEnabled: settingsForm.disputeEmailNotificationsEnabled,
      disputeAppealMessage: settingsForm.disputeAppealMessage.trim(),
      disputeFinalMessage: settingsForm.disputeFinalMessage.trim(),
      disputeAppealEmailSubject: settingsForm.disputeAppealEmailSubject.trim(),
      disputeFinalEmailSubject: settingsForm.disputeFinalEmailSubject.trim(),
      disputeAppealDecisionMessage: settingsForm.disputeAppealDecisionMessage.trim(),
      disputeAppealDecisionEmailSubject: settingsForm.disputeAppealDecisionEmailSubject.trim(),
    }, "Dispute message templates saved.");
  }

  const [disputeMessageDraft, setDisputeMessageDraft] = useState<Record<string, string>>({});
  const [disputeMessageParty, setDisputeMessageParty] = useState<Record<string, "buyer" | "seller">>({});
  const [sendingDisputeMessageId, setSendingDisputeMessageId] = useState<string | null>(null);
  const [claimingDisputeId, setClaimingDisputeId] = useState<string | null>(null);
  const [staffChatDraft, setStaffChatDraft] = useState<Record<string, string>>({});
  const [sendingStaffChatId, setSendingStaffChatId] = useState<string | null>(null);
  const [recommendationDraft, setRecommendationDraft] = useState<Record<string, { buyerFavor: boolean; note: string; handTo: "moderator" | "admin" }>>({});

  async function sendDisputeMessage(disputeId: string) {
    const message = disputeMessageDraft[disputeId]?.trim();
    if (!message) return;
    setSendingDisputeMessageId(disputeId);
    setErr(null);
    try {
      await api(`/v1/disputes/${disputeId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ toParty: disputeMessageParty[disputeId] || "buyer", message }),
      });
      setDisputeMessageDraft((current) => ({ ...current, [disputeId]: "" }));
      setMsg("Private message sent to the selected party.");
      await loadDisputes();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the dispute message");
    } finally {
      setSendingDisputeMessageId(null);
    }
  }

  async function claimDispute(disputeId: string, takeover: boolean) {
    setClaimingDisputeId(disputeId);
    setErr(null);
    try {
      await api(`/v1/disputes/${disputeId}/${takeover ? "takeover" : "claim"}`, {
        method: "POST",
        headers: headers(),
      });
      setMsg(takeover ? "You took over this case." : "You claimed this case.");
      await loadDisputes();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update case ownership");
    } finally {
      setClaimingDisputeId(null);
    }
  }

  async function sendStaffChat(disputeId: string) {
    const message = staffChatDraft[disputeId]?.trim();
    if (!message) return;
    setSendingStaffChatId(disputeId);
    setErr(null);
    try {
      await api(`/v1/disputes/${disputeId}/staff-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ message }),
      });
      setStaffChatDraft((current) => ({ ...current, [disputeId]: "" }));
      await loadDisputes();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the staff message");
    } finally {
      setSendingStaffChatId(null);
    }
  }

  async function submitRecommendation(disputeId: string) {
    const draft = recommendationDraft[disputeId] ?? { buyerFavor: true, note: "", handTo: "moderator" as const };
    if (!draft.note.trim()) {
      setErr("Write the recommendation before handing the case on.");
      return;
    }
    setClaimingDisputeId(disputeId);
    setErr(null);
    try {
      await api(`/v1/disputes/${disputeId}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ buyerFavor: draft.buyerFavor, note: draft.note.trim(), handTo: draft.handTo }),
      });
      setMsg(draft.handTo === "admin" ? "Recommendation sent. An admin can claim the ruling." : "Recommendation sent. A moderator can claim the ruling.");
      await loadDisputes();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not hand off the case");
    } finally {
      setClaimingDisputeId(null);
    }
  }

  async function saveEmailSettings() {
    await putSettings(
      {
        smtpHost: settingsForm.smtpHost.trim() || null,
        smtpPort: settingsForm.smtpPort ? Number(settingsForm.smtpPort) : null,
        smtpUser: settingsForm.smtpUser.trim() || null,
        smtpFrom: settingsForm.smtpFrom.trim() || null,
        smtpSecure: settingsForm.smtpSecure,
        remindersEnabled: settingsForm.remindersEnabled,
        reminderEmailSubject: settingsForm.reminderEmailSubject.trim() || null,
        reminderEmailBody: settingsForm.reminderEmailBody.trim() || null,
        ...(settingsForm.smtpPass ? { smtpPass: settingsForm.smtpPass } : {}),
      },
      "SMTP settings saved."
    );
  }

  async function searchEmailRecipients() {
    const q = emailUserSearch.trim();
    if (q.length < 2) return setErr("Enter at least two characters to search for a user.");
    setErr(null);
    try {
      const rows = await api<{ id: string; email: string | null; displayName: string | null }[]>(
        `/v1/admin/email/recipients?q=${encodeURIComponent(q)}`,
        { headers: headers() },
      );
      const withEmail = rows.filter((row): row is typeof row & { email: string } => !!row.email);
      setEmailRecipients(withEmail);
      setSelectedEmailRecipientId((current) => withEmail.some((row) => row.id === current) ? current : "");
      if (!withEmail.length) setMsg("No user with an email address matched that search.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not search users");
    }
  }

  async function sendPersonalizedEmail() {
    if (!selectedEmailRecipientId) return setErr("Choose a user before sending the email.");
    if (!emailMessageSubject.trim() || !emailMessageBody.trim()) return setErr("Enter both an email subject and message.");
    setEmailSending(true);
    setErr(null);
    try {
      await api("/v1/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ userId: selectedEmailRecipientId, subject: emailMessageSubject.trim(), message: emailMessageBody.trim() }),
      });
      setMsg("Email sent to the selected user.");
      setEmailMessageSubject("");
      setEmailMessageBody("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the email");
    } finally {
      setEmailSending(false);
    }
  }

  async function saveSiteSettings() {
    if (settingsForm.metaDescription.length > 2000) {
      setErr("Meta description can be at most 2,000 characters.");
      return;
    }
    if (settingsForm.metaKeywords.length > 4000) {
      setErr("Meta keywords can be at most 4,000 characters.");
      return;
    }
    await putSettings(
      {
        siteTitle: settingsForm.siteTitle.trim() || null,
        siteLogoUrl: settingsForm.siteLogoUrl.trim() || null,
        siteFaviconUrl: settingsForm.siteFaviconUrl.trim() || null,
        metaDescription: settingsForm.metaDescription.trim() || null,
        metaKeywords: settingsForm.metaKeywords.trim() || null,
        mobileAppsEnabled: settingsForm.mobileAppsEnabled,
        iosAppStoreUrl: settingsForm.iosAppStoreUrl.trim() || null,
        androidPlayStoreUrl: settingsForm.androidPlayStoreUrl.trim() || null,
        telegramUrl: settingsForm.telegramUrl.trim() || null,
        xUrl: settingsForm.xUrl.trim() || null,
        discordUrl: settingsForm.discordUrl.trim() || null,
      },
      "Site & SEO saved."
    );
  }

  async function saveSiteNoticeSettings() {
    if (settingsForm.siteNoticeTitle.trim().length > 120) {
      setErr("Pop-up title can be at most 120 characters.");
      return;
    }
    if (settingsForm.siteNoticeBody.trim().length > 3000) {
      setErr("Pop-up message can be at most 3,000 characters.");
      return;
    }
    if (!Number.isInteger(settingsForm.siteNoticeDelaySeconds) || settingsForm.siteNoticeDelaySeconds < 0 || settingsForm.siteNoticeDelaySeconds > 300) {
      setErr("Pop-up delay must be a whole number from 0 to 300 seconds.");
      return;
    }
    await putSettings(
      {
        siteNoticeEnabled: settingsForm.siteNoticeEnabled,
        siteNoticeTitle: settingsForm.siteNoticeTitle.trim(),
        siteNoticeBody: settingsForm.siteNoticeBody.trim(),
        siteNoticeAudience: settingsForm.siteNoticeAudience,
        siteNoticeDelaySeconds: Number(settingsForm.siteNoticeDelaySeconds),
      },
      "Wallet connection pop-up saved.",
    );
  }

  async function saveFeedbackEnabled(enabled: boolean) {
    setSettingsForm((f) => ({ ...f, feedbackEnabled: enabled }));
    await putSettings({ feedbackEnabled: enabled }, enabled ? "Feedback collection enabled." : "Feedback collection disabled.");
  }

  async function saveReferralLeaderboardEnabled(enabled: boolean) {
    setSettingsForm((f) => ({ ...f, referralLeaderboardEnabled: enabled }));
    await putSettings(
      { referralLeaderboardEnabled: enabled },
      enabled ? "Referral leaderboard enabled (admin referrers tab)." : "Referral leaderboard hidden.",
    );
    await refresh();
  }

  function tierDisplay(tier: string) {
    const key = tier.toLowerCase();
    if (key === "platinum") return "Platinum";
    if (key === "gold") return "Gold";
    if (key === "silver") return "Silver";
    return "Bronze";
  }

  function canResolveEscrow(escrow: Escrow) {
    if (isSuper) return true;
    if (user?.role === "agent") return false;
    const open = activeDisputeForEscrow(escrow);
    return open?.status === "open" && open.ownerUserId === user?.id;
  }

  function staffLabel(person?: { displayName: string | null; email: string | null } | null) {
    return person?.displayName || person?.email || "Staff";
  }

  const canFinalizeOnChain = isSuper || user?.role === "moderator";

  async function assertResolverCanSubmitPayout(escrow: Escrow) {
    if (!escrow.contractAddress) throw new Error("This trade has no deployed escrow contract, so it cannot pay out on-chain.");
    if (escrow.chain === "tron") {
      if (!tron.address || !tron.tronWeb || !tron.signer) throw new Error("Connect the configured TRON resolver wallet before ruling.");
      const dealContract = await tron.tronWeb.contract(TRON_DEAL_ABI, escrow.contractAddress);
      const deal = await dealContract.at(escrow.contractAddress);
      const chainState = Number(await deal.state().call());
      if (chainState !== 5) throw new Error("The escrow must be frozen on-chain by the resolver before payout.");
      const factoryAddress = String(await deal.factory().call());
      const factoryContract = await tron.tronWeb.contract(TRON_FACTORY_ABI, factoryAddress);
      const factory = await factoryContract.at(factoryAddress);
      const configuredResolver = String(await factory.resolver().call());
      const normalizeTronAddress = (value: string) => {
        try { return tron.tronWeb!.address.toHex(value).toLowerCase(); }
        catch { return value.toLowerCase(); }
      };
      if (normalizeTronAddress(configuredResolver) !== normalizeTronAddress(tron.address)) {
        throw new Error(`This connected wallet is not the configured resolver. Connect ${shortAddr(configuredResolver)}. Being the buyer or seller does not grant resolver permission.`);
      }
      return tron.address;
    }

    if (!address) throw new Error("Connect the configured resolver wallet before ruling.");
    if (chainId !== mainnet.id) throw new Error("Switch the resolver wallet to Ethereum mainnet before ruling.");
    if (!publicClient) throw new Error("Ethereum RPC is not ready. Connect the resolver wallet on Ethereum and try again.");
    const dealAddress = escrow.contractAddress as `0x${string}`;
    const chainState = await publicClient.readContract({ address: dealAddress, abi: escrowDealAbi, functionName: "state" });
    if (Number(chainState) !== 5) throw new Error("The escrow is not Disputed on-chain. Open the dispute from the trade party wallet first.");
    const factoryAddress = await publicClient.readContract({ address: dealAddress, abi: escrowDealAbi, functionName: "factory" });
    const configuredResolver = await publicClient.readContract({
      address: factoryAddress,
      abi: escrowFactoryAbi,
      functionName: "resolver",
    });
    if (configuredResolver.toLowerCase() !== address.toLowerCase()) {
      throw new Error(`Connected wallet ${shortAddr(address)} is not the configured resolver ${shortAddr(configuredResolver)}. Use the resolver wallet; it may also be a trade party wallet if configured that way.`);
    }
    return address;
  }

  async function submitResolverPayout(escrow: Escrow, disputeId: string, buyerFavor: boolean) {
    const resolver = await assertResolverCanSubmitPayout(escrow);
    let txHash: string;
    if (escrow.chain === "tron") {
      if (!tron.address || !tron.signer) throw new Error("Connect the configured TRON resolver wallet before ruling.");
      const receipt = await tronDealAction(tron.tronWeb!, tron.signer, tron.address, escrow.contractAddress!, "resolveDispute", [buyerFavor]);
      txHash = typeof receipt === "string" ? receipt : (receipt as { txid?: string })?.txid || "";
      if (!txHash) throw new Error("The TRON wallet did not return a transaction id.");
    } else {
      if (!publicClient) throw new Error("Ethereum RPC is not ready.");
      txHash = await writeContractAsync({
        address: escrow.contractAddress as `0x${string}`,
        abi: escrowDealAbi,
        functionName: "resolveDispute",
        args: [buyerFavor],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    }
    await api(`/v1/disputes/${disputeId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers() },
      body: JSON.stringify({ buyerFavor, resolverAddress: resolver, txHash }),
    });
  }

  async function freezeTronDisputeForReview(escrow: Escrow) {
    const dispute = activeDisputeForEscrow(escrow);
    if (!dispute || dispute.status !== "open") throw new Error("There is no open dispute to freeze.");
    if (escrow.chain !== "tron" || !escrow.contractAddress) throw new Error("A deployed TRON escrow is required.");
    if (!tron.address || !tron.tronWeb || !tron.signer) throw new Error("Connect the configured TRON resolver wallet to freeze this escrow.");

    const dealContract = await tron.tronWeb.contract(TRON_DEAL_ABI, escrow.contractAddress);
    const deal = await dealContract.at(escrow.contractAddress);
    const chainState = Number(await deal.state().call());
    const factoryAddress = String(await deal.factory().call());
    const factoryContract = await tron.tronWeb.contract(TRON_FACTORY_ABI, factoryAddress);
    const factory = await factoryContract.at(factoryAddress);
    const configuredResolver = String(await factory.resolver().call());
    const normalizeTronAddress = (value: string) => {
      try { return tron.tronWeb!.address.toHex(value).toLowerCase(); }
      catch { return value.toLowerCase(); }
    };
    if (normalizeTronAddress(configuredResolver) !== normalizeTronAddress(tron.address)) {
      throw new Error(`Connect the configured resolver wallet ${shortAddr(configuredResolver)} to freeze this escrow.`);
    }

    let txHash: string | undefined;
    const alreadyFrozen = chainState === 5;
    if (!alreadyFrozen) {
      if (chainState !== 1 && chainState !== 2) throw new Error("Only a funded or in-progress escrow can be frozen for dispute review.");
      const openerAddress = dispute.openedByUserId === escrow.buyerUserId
        ? escrow.buyerAddress
        : dispute.openedByUserId === escrow.sellerUserId
          ? escrow.sellerAddress
          : /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(dispute.openedBy)
            ? dispute.openedBy
            : undefined;
      if (!openerAddress) throw new Error("The dispute opener's linked wallet could not be matched to the buyer or seller.");
      txHash = await tronDealAction(tron.tronWeb, tron.signer, tron.address, escrow.contractAddress, "freezeDispute", [openerAddress]);
      const frozenState = Number(await deal.state().call());
      if (frozenState !== 5) throw new Error("The freeze transaction confirmed, but the escrow is not Disputed on-chain yet.");
    }

    await api(`/v1/disputes/${dispute.id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers() },
      body: JSON.stringify({ resolverAddress: tron.address, txHash, alreadyFrozen }),
    });
  }

  async function secureTronDispute(escrow: Escrow) {
    setResolvingId(escrow.id);
    setErr(null);
    try {
      await freezeTronDisputeForReview(escrow);
      setMsg("Escrow frozen on-chain for dispute review. The buyer and seller did not pay to open the case.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setResolvingId(null);
    }
  }

  async function assignDisputeModerator(disputeId: string, moderatorUserId: string | null) {
    setAssigningDisputeId(disputeId);
    setErr(null);
    try {
      await api(`/v1/disputes/${disputeId}/assign-moderator`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ moderatorUserId }),
      });
      setMsg(moderatorUserId ? "Moderator assigned for this dispute." : "Moderator assignment cleared.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningDisputeId(null);
    }
  }

  async function issueProvisionalRuling(escrow: Escrow, buyerFavor: boolean) {
    const d = escrow.disputes?.find((x) => x.status === "open");
    if (!d) return setErr("No open dispute on this escrow");
    if (escrow.chain === "tron" && escrow.contractAddress && !hasResolverFreezeRecord(escrow, d)) {
      return setErr("Freeze the TRON escrow with the resolver wallet before staff can rule.");
    }
    if (isSuper && escrow.contractAddress) {
      try {
        await assertResolverCanSubmitPayout(escrow);
      } catch (e) {
        return setErr(e instanceof Error ? e.message : String(e));
      }
    }
    const rulingNote = window.prompt("Optional ruling note for the trade room (visible to parties)", "") ?? undefined;
    if (rulingNote === null) return;
    setErr(null);
    setResolvingId(escrow.id);
    try {
      await api(`/v1/disputes/${d.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ buyerFavor, rulingNote: rulingNote.trim() || undefined }),
      });
      if (isSuper && escrow.contractAddress) {
        await submitResolverPayout(escrow, d.id, buyerFavor);
        setMsg(`Final ${buyerFavor ? "buyer" : "seller"}-favor ruling executed on-chain; the payout transaction is confirmed.`);
      } else {
        setMsg(isSuper
          ? `Final ruling recorded (${buyerFavor ? "buyer favor" : "seller favor"}); no appeal window applies. This trade has no escrow contract for on-chain payout.`
          : `Provisional ruling recorded (${buyerFavor ? "buyer favor" : "seller favor"}). The losing party has 3 days to appeal.`);
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setResolvingId(null);
    }
  }

  async function issueAdminFinalRuling(escrow: Escrow, buyerFavor: boolean) {
    const d = activeDisputeForEscrow(escrow);
    if (!isSuper || !d || d.status !== "ruled_pending_appeal") return;
    const confirmed = window.confirm(
      `Replace the provisional ruling with a final ${buyerFavor ? "buyer-favor" : "seller-favor"} ruling and close the appeal window?`,
    );
    if (!confirmed) return;
    if (escrow.contractAddress) {
      try {
        await assertResolverCanSubmitPayout(escrow);
      } catch (e) {
        return setErr(e instanceof Error ? e.message : String(e));
      }
    }
    const rulingNote = window.prompt("Optional final ruling note for the trade room", "") ?? undefined;
    if (rulingNote === null) return;
    setErr(null);
    setResolvingId(escrow.id);
    try {
      await api(`/v1/disputes/${d.id}/final-ruling`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ buyerFavor, rulingNote: rulingNote.trim() || undefined }),
      });
      if (escrow.contractAddress) {
        await submitResolverPayout(escrow, d.id, buyerFavor);
        setMsg(`Final ${buyerFavor ? "buyer" : "seller"}-favor ruling executed on-chain; the payout transaction is confirmed.`);
      } else {
        setMsg(`Final ruling recorded (${buyerFavor ? "buyer favor" : "seller favor"}). The appeal window is closed. This trade has no escrow contract for on-chain payout.`);
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setResolvingId(null);
    }
  }

  async function finalizeDisputePayout(escrow: Escrow) {
    const d = activeDisputeForEscrow(escrow);
    if (!d || d.buyerFavor == null) return setErr("No final ruling on this dispute");
    if (!clientCanFinalizePayout(d)) return setErr("Appeal window still open or appeal pending — cannot finalize yet");
    const buyerFavor = d.buyerFavor;
    setErr(null);
    setResolvingId(escrow.id);
    try {
      await submitResolverPayout(escrow, d.id, buyerFavor);
      setMsg(`On-chain payout executed (${buyerFavor ? "buyer favor" : "seller favor"}).`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setResolvingId(null);
    }
  }

  async function withdrawDisputeToNormalState(escrow: Escrow) {
    const d = activeDisputeForEscrow(escrow);
    if (!d || d.status !== "open" || d.buyerFavor != null) return setErr("Only an open, unruly dispute can be withdrawn");
    if (!window.confirm("Withdraw this dispute and return the escrow to its previous trade state? No ruling or payout will be made.")) return;
    setErr(null);
    setResolvingId(escrow.id);
    try {
      let txHash: string | undefined;
      if (escrow.contractAddress) {
        if (escrow.chain === "tron") {
          if (!tron.address || !tron.tronWeb || !tron.signer) throw new Error("Connect the configured TRON resolver wallet to cancel this on-chain dispute.");
          const contract = await tron.tronWeb.contract(TRON_DEAL_ABI, escrow.contractAddress);
          const deal = await contract.at(escrow.contractAddress);
          const chainState = Number(await deal.state().call());
          if (chainState === 5) {
            const receipt = await tronDealAction(tron.tronWeb, tron.signer, tron.address, escrow.contractAddress, "withdrawDispute");
            txHash = typeof receipt === "string" ? receipt : (receipt as { txid?: string })?.txid;
          } else if (chainState !== 1 && chainState !== 2) {
            throw new Error("The escrow is not in a state that can be returned to normal trade flow.");
          }
        } else {
          if (!publicClient) throw new Error("Ethereum RPC is not ready. Connect the resolver wallet on Ethereum and try again.");
          const chainState = await publicClient.readContract({
            address: escrow.contractAddress as `0x${string}`,
            abi: escrowDealAbi,
            functionName: "state",
          });
          if (Number(chainState) === 5) {
            if (!address) throw new Error("Connect the configured resolver wallet to cancel this on-chain dispute.");
            txHash = await writeContractAsync({
              address: escrow.contractAddress as `0x${string}`,
              abi: escrowDealAbi,
              functionName: "withdrawDispute",
            });
            await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
          } else if (Number(chainState) !== 1 && Number(chainState) !== 2) {
            throw new Error("The escrow is not in a state that can be returned to normal trade flow.");
          }
        }
      }
      await api(`/v1/disputes/${d.id}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ txHash }),
      });
      setMsg("Dispute withdrawn. The trade is back in its previous state; no party has been ruled against.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setResolvingId(null);
    }
  }

  async function decideDisputeAppeal(escrow: Escrow, uphold: boolean) {
    const d = activeDisputeForEscrow(escrow);
    if (!d?.appeal || d.status !== "appealed") return setErr("No open appeal on this dispute");
    let newBuyerFavor: boolean | undefined;
    if (!uphold) {
      const flip = window.confirm("Overturn the ruling? OK = switch winner (buyer ↔ seller), Cancel = abort");
      if (!flip) return;
      newBuyerFavor = !d.buyerFavor;
    }
    const decisionNote = window.prompt("Optional decision note", "") ?? undefined;
    if (decisionNote === null) return;
    setResolvingId(escrow.id);
    setErr(null);
    try {
      await api(`/v1/disputes/${d.id}/appeal/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ uphold, newBuyerFavor, decisionNote: decisionNote.trim() || undefined }),
      });
      setMsg(uphold ? "Appeal decided — original ruling upheld." : "Appeal decided — ruling overturned.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setResolvingId(null);
    }
  }

  async function decideAgentApplication(applicationId: string, approve: boolean) {
    const reviewNote = approve
      ? undefined
      : window.prompt("Optional rejection note for the applicant", "") ?? undefined;
    if (!approve && reviewNote === null) return;
    setDecidingApplicationId(applicationId);
    setErr(null);
    try {
      await api(`/v1/admin/agent-applications/${applicationId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ approve, reviewNote: reviewNote || undefined }),
      });
      setMsg(approve ? "Agent application approved — dispute access granted." : "Agent application rejected.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDecidingApplicationId(null);
    }
  }

  async function saveAgentRate(userId: string) {
    const raw = (rateDraft[userId] ?? "").trim();
    const commissionBps = raw === "" ? null : Number(raw);
    setErr(null);
    try {
      await api(`/v1/admin/agent-commissions/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ commissionBps }),
      });
      setMsg(commissionBps == null ? "Agent rate reset to the platform default." : "Agent rate saved for future cases.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function shortenAgentCoolingOff(userId: string) {
    const raw = (coolingDraft[userId] ?? "").trim();
    if (!raw) {
      setErr("Pick a new cooling-off end before shortening it.");
      return;
    }
    setErr(null);
    try {
      await api(`/v1/admin/agent-commissions/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ coolingOffEndsAt: new Date(raw).toISOString() }),
      });
      setMsg("Cooling-off shortened. Cases already marked cooling-off stay unpaid.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function waiveAgentCoolingOff(userId: string) {
    setErr(null);
    try {
      await api(`/v1/admin/agent-commissions/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ waiveCoolingOff: true }),
      });
      setMsg("Cooling-off waived for future cases.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function reviewAgentPayout(id: string, status: "sent" | "rejected") {
    setErr(null);
    try {
      await api(`/v1/admin/agent-payout-requests/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ status }),
      });
      setMsg(status === "sent" ? "Agent payout marked sent." : "Agent payout rejected.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function addAgent(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/v1/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({
          walletAddress: agentForm.walletAddress,
          displayName: agentForm.displayName,
          feeBps: Number(agentForm.feeBps),
        }),
      });
      setAgentForm({ walletAddress: "", displayName: "", feeBps: "500" });
      setMsg("Agent registered.");
      await refresh();
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
    }
  }

  async function seedDemo() {
    try {
      const demo = await api<Escrow>("/v1/escrows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerAddress: "0x1111111111111111111111111111111111111111",
          sellerAddress: "0x2222222222222222222222222222222222222222",
          tokenSymbol: "USDT",
          amountAtomic: "250000000",
          title: "Demo: Vintage camera",
          description: "Sample trade so you can click through the UI. Replace with real wallets when testing.",
        }),
      });
      setMsg(`Demo trade created · ${demo.id}`);
      navigate(`/trades/${demo.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading || !user || (user.role !== "admin" && user.role !== "moderator" && !(user.role === "agent" && user.permissions?.includes("disputes")))) {
    return <p className="muted"><TranslatedText text={"Checking admin session…"} /></p>;
  }

  function accessFor(row: AdminUserRow) {
    return accessDraft[row.id] ?? {
      moderator: row.role === "moderator",
      disputes: !!row.permissions?.includes("disputes"),
      blog: !!row.permissions?.includes("blog"),
      email: !!row.permissions?.includes("email"),
    };
  }

  function setAccess(row: AdminUserRow, next: { moderator: boolean; disputes: boolean; blog: boolean; email: boolean }) {
    setAccessDraft((prev) => ({ ...prev, [row.id]: next }));
  }

  function chooseRole(row: AdminUserRow, moderator: boolean) {
    const current = accessFor(row);
    setAccess(row, moderator
      ? { ...current, moderator: true }
      : { moderator: false, disputes: false, blog: false, email: false });
  }

  function togglePrivilege(row: AdminUserRow, key: "disputes" | "blog" | "email") {
    const current = accessFor(row);
    const checked = !current[key];
    setAccess(row, { ...current, moderator: true, [key]: checked });
  }

  function closeAccess(row: AdminUserRow) {
    setEditingAccessId((open) => (open === row.id ? null : open));
    setAccessDraft((prev) => {
      const copy = { ...prev };
      delete copy[row.id];
      return copy;
    });
  }

  async function saveAccess(row: AdminUserRow) {
    const draft = accessFor(row);
    const permissions = (["disputes", "blog", "email"] as const).filter((item) => draft[item]);
    setSavingAccessId(row.id);
    setErr(null);
    try {
      await api(`/v1/admin/users/${row.id}/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ moderator: draft.moderator, permissions }),
      });
      setAccessDraft((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      setMsg(draft.moderator ? `Privileges saved for ${row.email || "that user"}.` : `${row.email || "That user"} is a regular user again.`);
      setEditingAccessId(null);
      await loadUsers(userSearch);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAccessId(null);
    }
  }

  return (
    <div className="page admin-cms-page">
      <div className="page-head">
        <div>
          <p className="eyebrow"><TranslatedText text={"CMS"} /></p>
          <h1><TranslatedText text={isSuper ? "Admin dashboard" : "Staff desk"} /></h1>
          <p className="muted"> <TranslatedText text={"Signed in as"} /> <strong>{user.email}</strong>
            <TranslatedText text={isSuper ? " · super admin" : isDisputeAgent ? " · agent" : " · moderator"} />
          </p>
        </div>
        <div className="hero-actions">
          {isSuper && (
            <button type="button" className="secondary" onClick={() => seedDemo()}> <TranslatedText text={"Seed demo trade"} /> </button>
          )}
          <button type="button" className="secondary" onClick={() => signOut()}> <TranslatedText text={"Sign out"} /> </button>
        </div>
      </div>

      {msg && <p className="ok-banner">{msg}</p>}
      {err && <p className="error-banner"><TranslatedText text={err} /></p>}
      {loadWarnings.length > 0 && settings && (
        <p className="admin-load-warn"><TranslatedText text={"Some sections failed to refresh:"} /> {loadWarnings.join(" · ")}</p>
      )}

      <div className="admin-cms">
        <nav className="admin-cms-nav" aria-label={localizeCopy("Admin sections")}>
          {visibleNav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "active" : undefined}
              onClick={() => {
                setMsg(null);
                setSection(item.id);
              }}
            >
              {item.label}
              {item.id === "referrers" && pendingPayoutCount > 0 ? ` (${pendingPayoutCount})` : ""}
              {item.id === "feedback" && newFeedbackCount > 0 ? ` (${newFeedbackCount})` : ""}
            </button>
          ))}
        </nav>

        <div className="admin-cms-panel">
          {section === "overview" && (
            <>
            <section className="card-surface">
              <h2><TranslatedText text={"Overview"} /></h2>
              <p className="muted">
                <TranslatedText text={isSuper
                  ? "Quick counts across users, referrals, and operations."
                  : "You can open the sections assigned to you. Referral payouts and escrow platform changes stay with the super admin."} />
              </p>
              <div className="admin-stat-row">
                <div className="admin-stat-chip">
                  <span className="muted"><TranslatedText text={"API status"} /></span>
                  <strong aria-live="polite"><TranslatedText text={apiHealth === undefined ? "Checking…" : apiHealth?.ok ? "Online" : "Offline"} /></strong>
                  {apiHealth?.ok && <span className="muted"><TranslatedText text={"Ethereum chain"} /> {apiHealth.chainId ?? "—"}</span>}
                </div>
                {isSuper && (
                  <div className="admin-stat-chip">
                    <span className="muted"><TranslatedText text={"Referrers"} /></span>
                    <strong>{referrers.length}</strong>
                  </div>
                )}
                {isSuper && (
                  <div className="admin-stat-chip">
                    <span className="muted"><TranslatedText text={"Pending payouts"} /></span>
                    <strong>{pendingPayoutCount}</strong>
                  </div>
                )}
                {canDisputes && (
                  <div className="admin-stat-chip">
                    <span className="muted"><TranslatedText text={"Open disputes"} /></span>
                    <strong>{disputed.length}</strong>
                  </div>
                )}
                {isSuper && (
                  <div className="admin-stat-chip">
                    <span className="muted"><TranslatedText text={"Active agents"} /></span>
                    <strong>{agents.length}</strong>
                  </div>
                )}
                {(isSuper || canEmail) && (
                  <div className="admin-stat-chip">
                    <span className="muted"><TranslatedText text={"Email (SMTP)"} /></span>
                    <strong><TranslatedText text={settings?.emailConfigured || smtpPassConfigured ? "On" : "Off"} /></strong>
                  </div>
                )}
                {isSuper && (
                  <div className="admin-stat-chip">
                    <span className="muted"><TranslatedText text={"User feedback"} /></span>
                    <strong><TranslatedText text={settingsForm.feedbackEnabled ? `${newFeedbackCount} new` : "Off"} /></strong>
                  </div>
                )}
                {isSuper && (
                <div className="admin-stat-chip">
                  <span className="muted"><TranslatedText text={"Mobile apps"} /></span>
                  <strong>
                    <TranslatedText text={settingsForm.mobileAppsEnabled &&
                    (settingsForm.iosAppStoreUrl.trim() || settingsForm.androidPlayStoreUrl.trim())
                      ? "URLs saved"
                      : settingsForm.mobileAppsEnabled
                        ? "No store URLs"
                        : "Off"} />
                  </strong>
                </div>
                )}
              </div>
              <p className="hint">
                <TranslatedText text={isSuper
                  ? "Use the sidebar to manage users, referral payouts, SMTP, and public site metadata. Only this super admin account can approve referral payouts or change the escrow platform."
                  : "Assigned sections are in the sidebar. Payout decisions and escrow platform settings are not available on this account."} />
              </p>
            </section>
            {isSuper && <AdminOverviewFinancials headers={headers} />}
            </>
          )}

          {section === "analytics" && <AdminAnalyticsReport headers={headers} />}

          {section === "users" && (
            <section className="card-surface">
              <h2><TranslatedText text={"Registered users"} /></h2>
              <p className="muted"><TranslatedText text={"Search by email, then choose Regular user or Moderator. A moderator only receives the privileges you turn on."} /></p>
              <p className="privilege-lock"><TranslatedText text={"Referral payouts and escrow platform changes stay with the super admin. They cannot be assigned here."} /></p>
              <label> <TranslatedText text={"Search"} /> <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder={localizeCopy("email or name…")}
                  autoComplete="off"
                />
              </label>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><TranslatedText text={"Email"} /></th>
                      <th><TranslatedText text={"Name"} /></th>
                      <th><TranslatedText text={"Role"} /></th>
                      <th><TranslatedText text={"Privileges"} /></th>
                      <th><TranslatedText text={"Wallets"} /></th>
                      <th><TranslatedText text={"Referrer"} /></th>
                      <th><TranslatedText text={"Joined"} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const savedPrivileges = u.role === "moderator"
                        ? [
                            u.permissions?.includes("disputes") ? "Disputes" : "",
                            u.permissions?.includes("blog") ? "Blog" : "",
                            u.permissions?.includes("email") ? "Email" : "",
                          ].filter(Boolean)
                        : [];
                      const draft = accessFor(u);
                      const privilegeChoices = [
                        ["disputes", "Disputes", "Handle assigned disputes: join trade chat, ask questions, and resolve payout (after super admin assigns each case)."] as const,
                        ["blog", "Blog posts", "Write, edit, and publish field notes."] as const,
                        ["email", "Email (SMTP)", "Change mail delivery and reminder messages."] as const,
                      ];
                      return (
                      <Fragment key={u.id}>
                      <tr>
                        <td>{u.email || "—"}</td>
                        <td>{u.displayName || "—"}</td>
                        <td>
                          <span className={`access-pill ${u.role === "admin" ? "access-pill-admin" : u.role === "moderator" ? "access-pill-mod" : "access-pill-user"}`}>
                            <TranslatedText text={u.role === "admin" ? "Super admin" : u.role === "moderator" ? "Moderator" : "Regular user"} />
                          </span>
                        </td>
                        <td>
                          {u.role === "admin" ? (
                            <span className="privilege-lock"><TranslatedText text={"Payouts, platform, and every staff privilege."} /></span>
                          ) : (
                            <div className="access-summary">
                              <div className="access-chips">
                                {savedPrivileges.length
                                  ? savedPrivileges.map((label) => <span className="access-chip" key={label}>{label}</span>)
                                  : <span className="muted"><TranslatedText text={"No staff privileges"} /></span>}
                              </div>
                              <button
                                type="button"
                                className="secondary access-edit"
                                onClick={() => (editingAccessId === u.id ? closeAccess(u) : setEditingAccessId(u.id))}
                              >
                                <TranslatedText text={editingAccessId === u.id ? "Close" : "Edit access"} />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="mono">
                          {u.wallets.length
                            ? u.wallets.map((w) => `${w.chainKind}: ${shortAddr(w.address)}`).join(" · ")
                            : "—"}
                        </td>
                        <td>{u.referrer ? `${u.referrer.referralCode} (${u.referrer.tier})` : "—"}</td>
                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                      </tr>
                      {editingAccessId === u.id && u.role !== "admin" && (
                        <tr className="access-panel-row">
                          <td colSpan={7}>
                            <div className="access-panel">
                              <p className="access-panel-kicker"><TranslatedText text={"Access for"} /> <TranslatedText text={u.email || "this account"} /></p>
                              <div className="access-role-choice" role="group" aria-label={localizeCopy("Role")}>
                                <button type="button" className={!draft.moderator ? "is-selected" : ""} aria-pressed={!draft.moderator} onClick={() => chooseRole(u, false)}> <TranslatedText text={"Regular user"} /> <small><TranslatedText text={"Trade only. No admin desk."} /></small>
                                </button>
                                <button type="button" className={draft.moderator ? "is-selected" : ""} aria-pressed={draft.moderator} onClick={() => chooseRole(u, true)}> <TranslatedText text={"Moderator"} /> <small><TranslatedText text={"Opens the staff desk for the privileges below."} /></small>
                                </button>
                              </div>
                              <div className="access-priv-list">
                                {privilegeChoices.map(([key, title, detail]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    className={`access-priv${draft[key] ? " is-on" : ""}`}
                                    aria-pressed={draft[key]}
                                    disabled={!draft.moderator}
                                    onClick={() => togglePrivilege(u, key)}
                                  >
                                    <span className="access-priv-mark" aria-hidden><TranslatedText text={draft[key] ? "On" : "Off"} /></span>
                                    <span>
                                      <strong>{title}</strong>
                                      {detail}
                                    </span>
                                  </button>
                                ))}
                              </div>
                              <p className="privilege-lock"><TranslatedText text={"This account still cannot approve referral payouts or change escrow platform settings."} /></p>
                              <div className="access-actions">
                                <button type="button" disabled={savingAccessId === u.id} onClick={() => saveAccess(u)}>
                                  <TranslatedText text={savingAccessId === u.id ? "Saving…" : "Save access"} />
                                </button>
                                <button type="button" className="secondary" onClick={() => closeAccess(u)}><TranslatedText text={"Cancel"} /></button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );})}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted"> <TranslatedText text={"No users match your search."} /> </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === "referrers" && (
            <>
              <section className="card-surface">
                <h2><TranslatedText text={"Referral leaderboard"} /></h2>
                <p className="muted"> <TranslatedText text={"Rank referrers by lifetime commission earned. Names use display names only — never emails. Not shown on trade rooms or public pages today; public visibility during trades is an open product question."} /> </p>
                <label className="check-row tron-toggle" style={{ marginBottom: "1rem" }}>
                  <input
                    type="checkbox"
                    checked={settingsForm.referralLeaderboardEnabled}
                    onChange={(e) => saveReferralLeaderboardEnabled(e.target.checked)}
                  />
                  <strong><TranslatedText text={"Show referral leaderboard (admin only)"} /></strong>
                  <span className="muted" style={{ display: "block", fontWeight: 400, marginTop: "0.25rem" }}> <TranslatedText text={"When off, the ranked list below is hidden everywhere."} /> </span>
                </label>
                {settingsForm.referralLeaderboardEnabled ? (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th><TranslatedText text={"Rank"} /></th>
                          <th><TranslatedText text={"Referrer"} /></th>
                          <th><TranslatedText text={"Tier"} /></th>
                          <th><TranslatedText text={"Earned (USDT eq.)"} /></th>
                          <th><TranslatedText text={"Successful trades"} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {referralLeaderboard.map((row) => (
                          <tr key={row.rank}>
                            <td>{row.rank}</td>
                            <td>
                              <strong>{row.displayLabel}</strong>
                            </td>
                            <td>{tierDisplay(row.tier)}</td>
                            <td>{formatAmount(row.totalEarnedAtomic)}</td>
                            <td>{row.successfulReferrals}</td>
                          </tr>
                        ))}
                        {referralLeaderboard.length === 0 && (
                          <tr>
                            <td colSpan={5} className="muted"> <TranslatedText text={"No referrers with earned commission yet."} /> </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted"><TranslatedText text={"Enable the toggle above to view the ranked leaderboard."} /></p>
                )}
              </section>

              <section className="card-surface" style={{ marginTop: "1rem" }}>
                <h2><TranslatedText text={"Referrers"} /></h2>
                <p className="muted"><TranslatedText text={"Commission balances and successful referral counts."} /></p>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th><TranslatedText text={"Referrer"} /></th>
                        <th><TranslatedText text={"Tier"} /></th>
                        <th><TranslatedText text={"Trades"} /></th>
                        <th><TranslatedText text={"Earned"} /></th>
                        <th><TranslatedText text={"Pending"} /></th>
                        <th><TranslatedText text={"Code"} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrers.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.email}</strong>
                            {r.displayName ? ` · ${r.displayName}` : ""}
                          </td>
                          <td>{r.tier}</td>
                          <td>{r.successfulReferrals}</td>
                          <td>{formatAmount(r.totalEarnedAtomic)}</td>
                          <td>{formatAmount(r.pendingBalanceAtomic)}</td>
                          <td className="mono">{r.referralCode}</td>
                        </tr>
                      ))}
                      {referrers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="muted"> <TranslatedText text={"No referrers enrolled yet."} /> </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card-surface" style={{ marginTop: "1rem" }}>
                <h2><TranslatedText text={"Payout requests"} /></h2>
                <p className="muted"><TranslatedText text={"Pay manually to the wallet shown in each request, then mark it paid. You can return a request to unpaid if you need to correct its status. Referrers are emailed when SMTP is configured."} /></p>
                <label> <TranslatedText text={"Filter"} /> <select value={payoutFilter} onChange={(e) => setPayoutFilter(e.target.value as typeof payoutFilter)}>
                    <option value="pending"><TranslatedText text={"Unpaid"} /></option>
                    <option value="sent"><TranslatedText text={"Paid"} /></option>
                    <option value="rejected"><TranslatedText text={"Rejected"} /></option>
                    <option value="all"><TranslatedText text={"All (recent)"} /></option>
                  </select>
                </label>
                {payoutQueue.length === 0 && <p className="muted"><TranslatedText text={"No payout requests in this filter."} /></p>}
                {payoutQueue.map((req) => (
                  <div key={req.id} className="admin-referrer-row">
                    <div className="trade-card-top">
                      <strong>{req.referrer.email}</strong>
                      <StatusBadge status={req.status === "sent" ? "Paid" : req.status === "pending" ? "Unpaid" : req.status} />
                    </div>
                    {req.referrer.displayName ? ` (${req.referrer.displayName})` : ""} <TranslatedText text={"· tier"} /> {req.referrer.tier} ·{" "}
                    {req.referrer.successfulReferrals} <TranslatedText text={"trades"} /> <div className="muted"> <TranslatedText text={"Requested amount:"} /> <strong>{formatAmount(req.amountAtomic)}</strong> · {new Date(req.createdAt).toLocaleString()}
                    </div>
                    <div className="muted"> <TranslatedText text={"Requested wallet ("} />{req.payoutChain}): <span className="mono">{req.payoutAddress}</span>
                    </div>
                    {req.adminNote && <p className="hint"><TranslatedText text={"Admin note:"} /> {req.adminNote}</p>}
                    <div className="action-row" style={{ marginTop: "0.5rem" }}>
                      {req.status === "sent" ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={async () => {
                            if (!window.confirm("Mark this payout unpaid? The amount will return to the referrer's unpaid balance and the request will return to the queue.")) return;
                            await api(`/v1/admin/referral-payout-requests/${req.id}/status`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", ...headers() },
                              body: JSON.stringify({ status: "pending" }),
                            });
                            setMsg(`Payout marked unpaid for ${req.referrer.email}`);
                            await refresh();
                          }}
                        > <TranslatedText text={"Mark unpaid"} /> </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm(`Confirm you manually sent ${formatAmount(req.amountAtomic)} to ${req.payoutAddress} on ${req.payoutChain}.`)) return;
                            await api(`/v1/admin/referral-payout-requests/${req.id}/status`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", ...headers() },
                              body: JSON.stringify({ status: "sent" }),
                            });
                            setMsg(`Payout marked paid for ${req.referrer.email}`);
                            await refresh();
                          }}
                        > <TranslatedText text={"Mark paid"} /> </button>
                      )}
                      {req.status === "rejected" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={async () => {
                            if (!window.confirm("Reopen this rejected payout request as unpaid?")) return;
                            await api(`/v1/admin/referral-payout-requests/${req.id}/status`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", ...headers() },
                              body: JSON.stringify({ status: "pending" }),
                            });
                            setMsg(`Payout request reopened for ${req.referrer.email}`);
                            await refresh();
                          }}
                        > <TranslatedText text={"Reopen as unpaid"} /> </button>
                      )}
                      {req.status === "pending" && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={async () => {
                            const reason = window.prompt("Optional rejection reason (shown to referrer)", "");
                            if (reason === null) return;
                            await api(`/v1/admin/referral-payout-requests/${req.id}/reject`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json", ...headers() },
                              body: JSON.stringify({ reason: reason || undefined }),
                            });
                            setMsg(`Payout request rejected for ${req.referrer.email}`);
                            await refresh();
                          }}
                        > <TranslatedText text={"Reject request"} /> </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}

          {section === "operations" && (
            <section className="card-surface">
              <h2><TranslatedText text={"Open disputes"} /></h2>
              {isSuper && (
                <section className="card-surface" style={{ marginBottom: "1rem" }}>
                  <h3><TranslatedText text={"Pending agent applications"} /></h3>
                  <p className="muted"><TranslatedText text={"Applicants must meet ~$30k completed trade volume. Approve grants agent role and dispute access via the same path as manual staff assignment."} /></p>
                  {agentApplications.length === 0 ? (
                    <p className="muted"><TranslatedText text={"No pending applications."} /></p>
                  ) : (
                    <ul className="activity-list">
                      {agentApplications.map((app) => (
                        <li key={app.id} className="admin-referrer-row">
                          <strong>{app.user.displayName || app.user.email || app.user.id.slice(0, 8)}</strong>
                          <span className="muted"> <TranslatedText text={"· applied"} /> {new Date(app.createdAt).toLocaleString()}</span>
                          <p className="muted"><TranslatedText text={"Volume at apply:"} /> {formatAmount(app.volumeAtomicAtApply)} <TranslatedText text={"USDT eq."} /></p>
                          {app.applicantNote && <p className="hint">{app.applicantNote}</p>}
                          <div className="action-row">
                            <button
                              type="button"
                              disabled={decidingApplicationId === app.id}
                              onClick={() => void decideAgentApplication(app.id, true)}
                            >
                              <TranslatedText text={decidingApplicationId === app.id ? "Saving…" : "Approve agent"} />
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={decidingApplicationId === app.id}
                              onClick={() => void decideAgentApplication(app.id, false)}
                            > <TranslatedText text={"Reject"} /> </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {isSuper && (
                <section className="agent-activity-feed card-surface" style={{ marginBottom: "1rem" }}>
                  <h3><TranslatedText text={"Agent activity feed"} /></h3>
                  <p className="muted"><TranslatedText text={"Auditable log of agent dispute work (assignments, chat, evidence, escalations, resolutions)."} /></p>
                  {agentActivity.length === 0 ? (
                    <p className="muted"><TranslatedText text={"No agent actions logged yet."} /></p>
                  ) : (
                    <ul className="activity-list">
                      {agentActivity.map((row) => (
                        <li key={row.id}>
                          <span>
                            <strong><TranslatedText text={row.agent?.displayName || row.agent?.email || "Agent"} /></strong>
                            {" · "}
                            <code>{row.action}</code>
                            {" — "}
                            {row.summary}
                            {row.escrowId && (
                              <>
                                {" "}
                                <button type="button" className="linkish" onClick={() => navigate(`/trades/${row.escrowId}`)}> <TranslatedText text={"Open trade"} /> </button>
                              </>
                            )}
                          </span>
                          <time>{new Date(row.createdAt).toLocaleString()}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {canDisputes && (
                <p className="muted"> <TranslatedText text={"Shared queue. Available cases can be claimed. You can see who is handling each case. Only an admin can take over a case someone else owns."} /> </p>
              )}
              {isSuper && disputeModerators.length === 0 && (
                <p className="muted"><TranslatedText text={"Grant a user Moderator + Disputes under Users, then assign them to a case below."} /></p>
              )}
              {disputed.length === 0 && <p className="muted"><TranslatedText text={"No disputed trades."} /></p>}
              {disputed.map((e) => (
                <div key={e.id} className="dispute-card">
                  <div className="trade-card-top">
                    <button type="button" className="linkish" onClick={() => navigate(`/trades/${e.id}`)}>
                      {e.title}
                    </button>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="muted">
                    {formatAmount(e.amountAtomic)} {e.tokenSymbol} · {shortAddr(e.contractAddress)}
                  </p>
                  <p className="hint">{e.messages?.length ?? 0} <TranslatedText text={"chat entries ·"} /> {e.disputes?.reduce((count, dispute) => count + (dispute.evidence?.length ?? 0), 0) ?? 0} <TranslatedText text={"dispute files"} /></p>
                  {(() => {
                    const openDispute = activeDisputeForEscrow(e);
                    if (!openDispute) return null;
                    const handler = openDispute.owner;
                    const handlerLabel = handler ? staffLabel(handler) : "Available";
                    const mine = !!user && openDispute.ownerUserId === user.id;
                    const canClaim = openDispute.status === "open" && !openDispute.ownerUserId && (
                      !openDispute.awaitingRulingTier
                      || isSuper
                      || user?.role === openDispute.awaitingRulingTier
                    );
                    const canTakeOver = isSuper && openDispute.status === "open" && !!openDispute.ownerUserId && openDispute.ownerUserId !== user?.id;
                    const recommendation = recommendationDraft[openDispute.id] ?? { buyerFavor: true, note: "", handTo: "moderator" as const };
                    return (
                      <>
                        <p className="muted"> <TranslatedText text={"Handling:"} /> <strong><TranslatedText text={mine ? "You" : handlerLabel} /></strong>
                          {handler?.role ? ` · ${handler.role}` : ""}
                          {openDispute.claimedAt ? ` · since ${new Date(openDispute.claimedAt).toLocaleString()}` : ""}
                          {openDispute.awaitingRulingTier && !openDispute.ownerUserId
                            ? ` · waiting for ${openDispute.awaitingRulingTier === "admin" ? "an admin" : "a moderator"} to claim the ruling`
                            : ""}
                        </p>
                        {(canClaim || canTakeOver) && (
                          <div className="action-row">
                            {canClaim && (
                              <button type="button" disabled={claimingDisputeId === openDispute.id} onClick={() => void claimDispute(openDispute.id, false)}>
                                <TranslatedText text={claimingDisputeId === openDispute.id ? "Claiming…" : "Claim case"} />
                              </button>
                            )}
                            {canTakeOver && (
                              <button type="button" className="secondary" disabled={claimingDisputeId === openDispute.id} onClick={() => void claimDispute(openDispute.id, true)}>
                                <TranslatedText text={claimingDisputeId === openDispute.id ? "Taking over…" : "Take over case"} />
                              </button>
                            )}
                          </div>
                        )}
                        {openDispute.recommendationNote && (
                          <p className="hint"> <TranslatedText text={"Agent recommendation:"} /> <strong><TranslatedText text={openDispute.recommendationBuyerFavor ? "buyer favor" : "seller favor"} /></strong>
                            {openDispute.recommendedBy ? ` · ${staffLabel(openDispute.recommendedBy)}` : ""}
                            . {openDispute.recommendationNote}
                          </p>
                        )}
                        {user?.role === "agent" && mine && openDispute.status === "open" && (
                          <div className="role-box">
                            <h3><TranslatedText text={"Recommendation"} /></h3>
                            <p className="muted"><TranslatedText text={"Hand this case to a moderator or admin. They issue the ruling. You do not release the funds."} /></p>
                            <label> <TranslatedText text={"Recommend"} /> <select
                                value={recommendation.buyerFavor ? "buyer" : "seller"}
                                onChange={(ev) => setRecommendationDraft((current) => ({
                                  ...current,
                                  [openDispute.id]: { ...recommendation, buyerFavor: ev.target.value === "buyer" },
                                }))}
                              >
                                <option value="buyer"><TranslatedText text={"Buyer favor"} /></option>
                                <option value="seller"><TranslatedText text={"Seller favor"} /></option>
                              </select>
                            </label>
                            <label> <TranslatedText text={"Hand to"} /> <select
                                value={recommendation.handTo}
                                onChange={(ev) => setRecommendationDraft((current) => ({
                                  ...current,
                                  [openDispute.id]: { ...recommendation, handTo: ev.target.value as "moderator" | "admin" },
                                }))}
                              >
                                <option value="moderator"><TranslatedText text={"Moderator"} /></option>
                                <option value="admin"><TranslatedText text={"Admin"} /></option>
                              </select>
                            </label>
                            <label> <TranslatedText text={"Note"} /> <textarea
                                rows={3}
                                maxLength={4000}
                                value={recommendation.note}
                                onChange={(ev) => setRecommendationDraft((current) => ({
                                  ...current,
                                  [openDispute.id]: { ...recommendation, note: ev.target.value },
                                }))}
                                placeholder={localizeCopy("Why this party should win…")}
                              />
                            </label>
                            <button type="button" disabled={claimingDisputeId === openDispute.id} onClick={() => void submitRecommendation(openDispute.id)}>
                              <TranslatedText text={claimingDisputeId === openDispute.id ? "Sending…" : "Submit recommendation and hand off"} />
                            </button>
                          </div>
                        )}
                        <div className="role-box staff-case-chat">
                          <h3><TranslatedText text={"Staff case chat"} /></h3>
                          <p className="muted"><TranslatedText text={"Only staff can see this. The buyer and seller cannot."} /></p>
                          {(openDispute.staffMessages?.length ?? 0) === 0 && <p className="muted"><TranslatedText text={"No staff messages yet."} /></p>}
                          <ul className="activity-list">
                            {(openDispute.staffMessages || []).map((message) => (
                              <li key={message.id}>
                                <span>
                                  <strong>{staffLabel(message.author)}</strong>
                                  {" — "}
                                  {message.body}
                                </span>
                                <time>{new Date(message.createdAt).toLocaleString()}</time>
                              </li>
                            ))}
                          </ul>
                          <label> <TranslatedText text={"Message staff"} /> <textarea
                              rows={2}
                              maxLength={4000}
                              value={staffChatDraft[openDispute.id] || ""}
                              onChange={(ev) => setStaffChatDraft((current) => ({ ...current, [openDispute.id]: ev.target.value }))}
                              placeholder={localizeCopy("Coordinate on this case…")}
                            />
                          </label>
                          <button type="button" disabled={sendingStaffChatId === openDispute.id || !staffChatDraft[openDispute.id]?.trim()} onClick={() => void sendStaffChat(openDispute.id)}>
                            <TranslatedText text={sendingStaffChatId === openDispute.id ? "Sending…" : "Send to staff"} />
                          </button>
                        </div>
                        <p className="muted"> <TranslatedText text={"Case status:"} /> <strong>{openDispute.status.replace(/_/g, " ")}</strong>
                          {e.chain === "tron" && e.contractAddress && openDispute.status === "open"
                            ? ` · ${hasResolverFreezeRecord(e, openDispute) ? "escrow frozen on-chain" : "awaiting resolver freeze"}`
                            : ""}
                          {openDispute.buyerFavor != null && openDispute.status !== "open"
                            ? ` · ruling: ${openDispute.buyerFavor ? "buyer favor" : "seller favor"}`
                            : ""}
                          {openDispute.appealDeadlineAt && openDispute.status === "ruled_pending_appeal"
                            ? ` · appeal until ${new Date(openDispute.appealDeadlineAt).toLocaleString()}`
                            : ""}
                        </p>
                        {openDispute.appeal?.reason && (
                          <p className="hint"><TranslatedText text={"Appeal:"} /> {openDispute.appeal.reason.slice(0, 280)}{openDispute.appeal.reason.length > 280 ? "…" : ""}</p>
                        )}
                      </>
                    );
                  })()}
                  {canDisputes && (() => {
                    const activeDispute = activeDisputeForEscrow(e);
                    if (!activeDispute || activeDispute.status === "withdrawn") return null;
                    const ownsCase = isSuper || activeDispute.ownerUserId === user?.id;
                    if (!ownsCase) return null;
                    const targetParty = disputeMessageParty[activeDispute.id] || "buyer";
                    return (
                      <div className="role-box dispute-admin-message">
                        <h3><TranslatedText text={"Private message to a party"} /></h3>
                        <p className="muted"><TranslatedText text={"Only the selected party and staff can see this message."} /></p>
                        <label> <TranslatedText text={"Recipient"} /> <select value={targetParty} onChange={(ev) => setDisputeMessageParty((current) => ({ ...current, [activeDispute.id]: ev.target.value as "buyer" | "seller" }))}>
                            <option value="buyer"><TranslatedText text={"Buyer"} /></option>
                            <option value="seller"><TranslatedText text={"Seller"} /></option>
                          </select>
                        </label>
                        <label> <TranslatedText text={"Message"} /> <textarea rows={3} maxLength={4000} value={disputeMessageDraft[activeDispute.id] || ""} onChange={(ev) => setDisputeMessageDraft((current) => ({ ...current, [activeDispute.id]: ev.target.value }))} placeholder={localizeCopy("Write a private message about this dispute…")} />
                        </label>
                        <button type="button" disabled={sendingDisputeMessageId === activeDispute.id || !disputeMessageDraft[activeDispute.id]?.trim()} onClick={() => void sendDisputeMessage(activeDispute.id)}>
                          <TranslatedText text={sendingDisputeMessageId === activeDispute.id ? "Sending…" : "Send private message"} />
                        </button>
                      </div>
                    );
                  })()}
                  {isSuper && (() => {
                    const openDispute = e.disputes?.find((d) => d.status === "open");
                    if (!openDispute) return null;
                    const draft = assignDraft[openDispute.id] ?? openDispute.assignedModeratorUserId ?? "";
                    return (
                      <div className="action-row assign-mod-row">
                        <label className="assign-mod-label"> <TranslatedText text={"Assign moderator"} /> <select
                            value={draft}
                            disabled={assigningDisputeId === openDispute.id}
                            onChange={(ev) => setAssignDraft((prev) => ({ ...prev, [openDispute.id]: ev.target.value }))}
                          >
                            <option value=""><TranslatedText text={"— Unassigned —"} /></option>
                            {disputeModerators.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.displayName || m.email || m.id.slice(0, 8)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="secondary"
                          disabled={assigningDisputeId === openDispute.id}
                          onClick={() => assignDisputeModerator(openDispute.id, draft || null)}
                        >
                          <TranslatedText text={assigningDisputeId === openDispute.id ? "Saving…" : "Save assignment"} />
                        </button>
                      </div>
                    );
                  })()}
                  <div className="action-row">
                    <button type="button" className="secondary" onClick={() => navigate(`/trades/${e.id}`)}> <TranslatedText text={"Review agreement, chat & evidence"} /> </button>
                    {isSuper && e.chain === "tron" && e.contractAddress && activeDisputeForEscrow(e)?.status === "open"
                      && !hasResolverFreezeRecord(e, activeDisputeForEscrow(e)!) && (
                      <div className="action-row">
                        <button type="button" className="secondary" disabled={resolvingId === e.id || !tron.address} onClick={() => void secureTronDispute(e)}>
                          <TranslatedText text={resolvingId === e.id ? "Freezing escrow…" : "Freeze escrow on-chain for review"} />
                        </button>
                        {!tron.address && <span className="hint"><TranslatedText text={"Connect the configured resolver wallet. It pays the network fee; the parties do not pay to open the dispute."} /></span>}
                      </div>
                    )}
                    {isSuper && e.chain === "tron" && activeDisputeForEscrow(e)?.status === "open"
                      && hasResolverFreezeRecord(e, activeDisputeForEscrow(e)!) && (
                      <p className="admin-handling-banner"><TranslatedText text={"Escrow frozen on-chain. Staff can review and rule for either party."} /></p>
                    )}
                    {canFinalizeOnChain && activeDisputeForEscrow(e)?.status === "open" && (
                      <>
                        {e.contractAddress && (e.chain === "tron" ? !tron.address : !address) && (
                          e.chain === "tron" ? (
                            <button type="button" className="secondary" disabled={tron.connecting} onClick={() => void tron.connect()}>
                              <TranslatedText text={tron.connecting ? "Connecting TRON wallet…" : "Connect resolver wallet to rule, pay, or withdraw"} />
                            </button>
                          ) : (
                            <ConnectEvmWalletButton className="secondary"><TranslatedText text={"Connect resolver wallet to rule, pay, or withdraw"} /></ConnectEvmWalletButton>
                          )
                        )}
                        <button type="button" className="secondary" disabled={resolvingId === e.id} onClick={() => withdrawDisputeToNormalState(e)}>
                          <TranslatedText text={resolvingId === e.id ? "Withdrawing…" : "Withdraw dispute · return escrow to normal"} />
                        </button>
                      </>
                    )}
                    {canResolveEscrow(e) && activeDisputeForEscrow(e)?.status === "open"
                      && (e.chain !== "tron" || !e.contractAddress || hasResolverFreezeRecord(e, activeDisputeForEscrow(e)!)) && (
                      <>
                        <button type="button" disabled={resolvingId === e.id} onClick={() => issueProvisionalRuling(e, true)}>
                          {resolvingId === e.id ? (isSuper ? "Waiting for resolver transaction…" : "Saving…") : `${isSuper ? "Issue & pay final ruling" : "Issue provisional ruling"} · buyer favor`}
                        </button>
                        <button type="button" className="secondary" disabled={resolvingId === e.id} onClick={() => issueProvisionalRuling(e, false)}>
                          {resolvingId === e.id ? (isSuper ? "Waiting for resolver transaction…" : "Saving…") : `${isSuper ? "Issue & pay final ruling" : "Issue provisional ruling"} · seller favor`}
                        </button>
                      </>
                    )}
                    {isSuper && activeDisputeForEscrow(e)?.status === "ruled_pending_appeal" && (
                      <>
                        <button type="button" disabled={resolvingId === e.id} onClick={() => issueAdminFinalRuling(e, true)}>
                          <TranslatedText text={resolvingId === e.id ? "Waiting for resolver transaction…" : "Set final & pay · buyer favor"} />
                        </button>
                        <button type="button" className="secondary" disabled={resolvingId === e.id} onClick={() => issueAdminFinalRuling(e, false)}>
                          <TranslatedText text={resolvingId === e.id ? "Waiting for resolver transaction…" : "Set final & pay · seller favor"} />
                        </button>
                      </>
                    )}
                    {canFinalizeOnChain && activeDisputeForEscrow(e) && clientCanFinalizePayout(activeDisputeForEscrow(e)!) && (
                      <>
                        {e.contractAddress && (e.chain === "tron" ? !tron.address : !address) ? (
                          e.chain === "tron" ? (
                            <button type="button" className="primary" disabled={tron.connecting} onClick={() => void tron.connect()}>
                              <TranslatedText text={tron.connecting ? "Connecting TRON wallet…" : "Connect resolver wallet to pay ruling"} />
                            </button>
                          ) : (
                            <ConnectEvmWalletButton className="primary"><TranslatedText text={"Connect resolver wallet to pay ruling"} /></ConnectEvmWalletButton>
                          )
                        ) : (
                          <button type="button" className="primary" disabled={resolvingId === e.id} onClick={() => finalizeDisputePayout(e)}>
                            <TranslatedText text={resolvingId === e.id
                              ? "Waiting for payout confirmation…"
                              : `Pay ruling on-chain · ${activeDisputeForEscrow(e)!.buyerFavor ? "buyer" : "seller"} favor`} />
                          </button>
                        )}
                        {e.contractAddress && !(e.chain === "tron" ? tron.address : address) && (
                          <span className="hint"><TranslatedText text={"Connect the resolver wallet first. Then click the payout button to approve the on-chain ruling."} /></span>
                        )}
                      </>
                    )}
                    {canFinalizeOnChain && activeDisputeForEscrow(e)?.status === "appealed" && (
                      <>
                        <button type="button" disabled={resolvingId === e.id} onClick={() => decideDisputeAppeal(e, true)}> <TranslatedText text={"Uphold ruling"} /> </button>
                        <button type="button" className="secondary" disabled={resolvingId === e.id} onClick={() => decideDisputeAppeal(e, false)}> <TranslatedText text={"Overturn ruling"} /> </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {isSuper && (
              <>
              <h2 style={{ marginTop: "1.5rem" }}><TranslatedText text={"Agents"} /></h2>
              <ul className="activity-list">
                {agents.map((a) => (
                  <li key={a.id}>
                    <strong>{a.displayName}</strong> · {shortAddr(a.walletAddress)} · {(a.feeBps / 100).toFixed(1)}<TranslatedText text={"% fee ·"} />{" "}
                    {a.disputesResolved} <TranslatedText text={"resolved"} /> </li>
                ))}
                {agents.length === 0 && <li className="muted"><TranslatedText text={"No agents registered."} /></li>}
              </ul>
              <form className="form-stack" onSubmit={addAgent}>
                <label> <TranslatedText text={"Display name"} /> <input required value={agentForm.displayName} onChange={(e) => setAgentForm({ ...agentForm, displayName: e.target.value })} />
                </label>
                <label> <TranslatedText text={"Wallet"} /> <input
                    required
                    className="mono"
                    value={agentForm.walletAddress}
                    onChange={(e) => setAgentForm({ ...agentForm, walletAddress: e.target.value })}
                  />
                </label>
                <label> <TranslatedText text={"Fee (bps)"} /> <input value={agentForm.feeBps} onChange={(e) => setAgentForm({ ...agentForm, feeBps: e.target.value })} />
                </label>
                <button type="submit"><TranslatedText text={"Register agent"} /></button>
              </form>
              <h2 style={{ marginTop: "1.5rem" }}><TranslatedText text={"Case commission"} /></h2>
              <p className="muted"> <TranslatedText text={"Opted-in agents earn a rate in basis points on future finalized cases. Blank saves the platform default (50 bps, 0.5% of platform profit). The cap is 500 bps (5%)."} /> </p>
              {agentPayouts.length > 0 && (
                <ul className="activity-list">
                  {agentPayouts.map((payout) => (
                    <li key={payout.id}>
                      <strong>{payout.profile.displayName}</strong> · {formatAmount(payout.amountAtomic)} · {payout.profile.payoutChain} · <span className="mono">{payout.profile.payoutAddress}</span>
                      <div className="action-row">
                        <button type="button" onClick={() => void reviewAgentPayout(payout.id, "sent")}><TranslatedText text={"Mark sent"} /></button>
                        <button type="button" className="secondary" onClick={() => void reviewAgentPayout(payout.id, "rejected")}><TranslatedText text={"Reject"} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="activity-list">
                {commissionAgents.map((agent) => (
                  <li key={agent.userId}>
                    <strong><TranslatedText text={agent.profile?.displayName || agent.accountName || agent.email || "Agent"} /></strong>
                    {" · "}
                    {agent.finalizedCaseCount} <TranslatedText text={"finalized cases"} /> {" · "}
                    <TranslatedText text={agent.profile ? `${agent.profile.effectiveBps} bps` : "not opted in"} />
                    {agent.profile && (
                      <div className="action-row assign-mod-row">
                        <label className="assign-mod-label"> <TranslatedText text={"Rate override (bps)"} /> <input
                            value={rateDraft[agent.userId] ?? (agent.profile.commissionBps == null ? "" : String(agent.profile.commissionBps))}
                            onChange={(e) => setRateDraft((current) => ({ ...current, [agent.userId]: e.target.value }))}
                            placeholder="50"
                          />
                        </label>
                        <button type="button" className="secondary" onClick={() => void saveAgentRate(agent.userId)}><TranslatedText text={"Save rate"} /></button>
                        <label className="assign-mod-label"> <TranslatedText text={"Cooling-off ends"} /> <input
                            type="datetime-local"
                            value={coolingDraft[agent.userId] ?? ""}
                            onChange={(e) => setCoolingDraft((current) => ({ ...current, [agent.userId]: e.target.value }))}
                          />
                        </label>
                        <button type="button" className="secondary" onClick={() => void shortenAgentCoolingOff(agent.userId)}><TranslatedText text={"Shorten cooling-off"} /></button>
                        <button type="button" className="secondary" onClick={() => void waiveAgentCoolingOff(agent.userId)}><TranslatedText text={"Waive cooling-off"} /></button>
                      </div>
                    )}
                  </li>
                ))}
                {commissionAgents.length === 0 && <li className="muted"><TranslatedText text={"No approved agents yet."} /></li>}
              </ul>
              </>
              )}
            </section>
          )}

          {section === "platform" && settings && (
            <section className="card-surface">
              <h2><TranslatedText text={"Escrow platform"} /></h2>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  savePlatformSettings();
                }}
              >
                <label> <TranslatedText text={"Fee recipient wallet"} /> <input
                    className="mono"
                    value={settingsForm.feeRecipientWallet}
                    onChange={(e) => setSettingsForm({ ...settingsForm, feeRecipientWallet: e.target.value })}
                  />
                </label>
                <label> <TranslatedText text={"Factory address"} /> <input
                    className="mono"
                    value={settingsForm.factoryAddress}
                    onChange={(e) => setSettingsForm({ ...settingsForm, factoryAddress: e.target.value })}
                    placeholder={localizeCopy("0x… EscrowFactory on Ethereum")}
                  />
                </label>
                <label> <TranslatedText text={"Resolution mode"} /> <select
                    value={settingsForm.resolutionMode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, resolutionMode: e.target.value })}
                  >
                    <option value="admin"><TranslatedText text={"Admin resolves disputes"} /></option>
                    <option value="agent"><TranslatedText text={"Agent resolves disputes"} /></option>
                  </select>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={settingsForm.agentModeEnabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, agentModeEnabled: e.target.checked })}
                  /> <TranslatedText text={"Agent mode enabled"} /> </label>

                <hr className="settings-divider" />
                <h3><TranslatedText text={"TRC-20 availability"} /></h3>
                <p className="hint"> <TranslatedText text={"This controls new TRC-20 trade creation and joining. Turning it off hides TRON for new trades and blocks pending TRON invites; trades that already have both parties joined remain available for completion and dispute resolution."} /> </p>
                <div className="check-row tron-toggle" role="group" aria-label={localizeCopy("TRC-20 trade availability")}>
                  <strong aria-live="polite"> <TranslatedText text={"New TRC-20 trades:"} /> <TranslatedText text={settingsForm.tronSupportEnabled ? "Enabled" : "Disabled — coming soon"} />
                  </strong>
                  <button
                    type="button"
                    className={settingsForm.tronSupportEnabled ? "secondary" : ""}
                    aria-pressed={settingsForm.tronSupportEnabled}
                    onClick={() => setTronSupportEnabled(!settingsForm.tronSupportEnabled)}
                  >
                    <TranslatedText text={settingsForm.tronSupportEnabled ? "Disable TRC-20" : "Enable TRC-20"} />
                  </button>
                </div>
                <label> <TranslatedText text={"Tron USDT (TRC-20) contract"} /> <input
                    className="mono"
                    value={settingsForm.tronUsdtAddress}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tronUsdtAddress: e.target.value })}
                  />
                </label>
                <label> <TranslatedText text={"Tron escrow factory"} /> <input
                    className="mono"
                    value={settingsForm.tronFactoryAddress}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tronFactoryAddress: e.target.value })}
                  />
                </label>
                <label> <TranslatedText text={"Tron fee recipient"} /> <input
                    className="mono"
                    value={settingsForm.tronFeeRecipientWallet}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tronFeeRecipientWallet: e.target.value })}
                  />
                </label>
                <label> <TranslatedText text={"Tron dispute resolver"} /> <input
                    className="mono"
                    value={settingsForm.tronResolverWallet}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tronResolverWallet: e.target.value })}
                  />
                </label>
                <button type="submit"><TranslatedText text={"Save platform settings"} /></button>
              </form>
              {cfg && (
                <div className="role-box">
                  <h3><TranslatedText text={"Configured role wallets"} /></h3>
                  <ul className="kv-list">
                    {Object.entries(cfg.addresses).map(([k, v]) => (
                      <li key={k}>
                        <span>{k}</span>
                        <span className="mono">{v || "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {section === "email" && settings && (
            <section className="card-surface">
              <h2><TranslatedText text={"Email delivery (SMTP)"} /></h2>
              <p className="hint"> <TranslatedText text={"Required for magic-link sign-in and referral payout notifications. Port"} /> <strong>587</strong> <TranslatedText text={"uses STARTTLS; enable implicit TLS for port"} /> <strong>465</strong>.
              </p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEmailSettings();
                }}
              >
                <label> <TranslatedText text={"SMTP host"} /> <input
                    value={settingsForm.smtpHost}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpHost: e.target.value })}
                    placeholder={localizeCopy("smtp.sendgrid.net")}
                    autoComplete="off"
                  />
                </label>
                <label> <TranslatedText text={"SMTP port"} /> <input
                    type="number"
                    min={1}
                    max={65535}
                    value={settingsForm.smtpPort}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpPort: e.target.value })}
                  />
                </label>
                <label> <TranslatedText text={"SMTP user"} /> <input
                    value={settingsForm.smtpUser}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpUser: e.target.value })}
                    autoComplete="off"
                  />
                </label>
                <label> <TranslatedText text={"SMTP password"} /> <input
                    type="password"
                    value={settingsForm.smtpPass}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpPass: e.target.value })}
                    placeholder={localizeCopy(smtpPassConfigured ? "Saved — enter only to replace" : "App password or API key")}
                    autoComplete="new-password"
                  />
                </label>
                <label> <TranslatedText text={"From address"} /> <input
                    value={settingsForm.smtpFrom}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpFrom: e.target.value })}
                    placeholder={localizeCopy("noreply@yourdomain.com")}
                    autoComplete="off"
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={settingsForm.smtpSecure}
                    onChange={(e) => setSettingsForm({ ...settingsForm, smtpSecure: e.target.checked })}
                  /> <TranslatedText text={"Implicit TLS (SSL) — typical for port 465"} /> </label>
                <ReminderDesk
                  enabled={settingsForm.remindersEnabled}
                  subject={settingsForm.reminderEmailSubject}
                  body={settingsForm.reminderEmailBody}
                  onEnabled={(remindersEnabled) => setSettingsForm({ ...settingsForm, remindersEnabled })}
                  onSubject={(reminderEmailSubject) => setSettingsForm({ ...settingsForm, reminderEmailSubject })}
                  onBody={(reminderEmailBody) => setSettingsForm({ ...settingsForm, reminderEmailBody })}
                />
                <button type="submit"><TranslatedText text={"Save email settings"} /></button>
              </form>
              <section className="role-box" style={{ marginTop: "1.25rem" }}>
                <h3><TranslatedText text={"Automated dispute notifications"} /></h3>
                <p className="muted"> <TranslatedText text={"When enabled, the losing party receives a private trade-room message and an email when a ruling is issued or an appeal is decided. Email delivery needs a configured SMTP server. Placeholders:"} /> <TranslatedText text={"{tradeTitle}"} />, <TranslatedText text={"{favoredParty}"} />, <TranslatedText text={"{appealDays}"} />, <TranslatedText text={"{appealDeadline}"} />, <TranslatedText text={"{tradeUrl}"} />.
                </p>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={settingsForm.disputeEmailNotificationsEnabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, disputeEmailNotificationsEnabled: e.target.checked })}
                  /> <TranslatedText text={"Send automated dispute messages and emails"} /> </label>
                <h4><TranslatedText text={"Provisional ruling · appeal window"} /></h4>
                <label> <TranslatedText text={"Email subject"} /> <input maxLength={180} value={settingsForm.disputeAppealEmailSubject} onChange={(e) => setSettingsForm({ ...settingsForm, disputeAppealEmailSubject: e.target.value })} />
                </label>
                <label> <TranslatedText text={"Message"} /> <textarea rows={4} maxLength={4000} value={settingsForm.disputeAppealMessage} onChange={(e) => setSettingsForm({ ...settingsForm, disputeAppealMessage: e.target.value })} />
                </label>
                <h4><TranslatedText text={"Final ruling · no appeal"} /></h4>
                <label> <TranslatedText text={"Email subject"} /> <input maxLength={180} value={settingsForm.disputeFinalEmailSubject} onChange={(e) => setSettingsForm({ ...settingsForm, disputeFinalEmailSubject: e.target.value })} />
                </label>
                <label> <TranslatedText text={"Message"} /> <textarea rows={3} maxLength={4000} value={settingsForm.disputeFinalMessage} onChange={(e) => setSettingsForm({ ...settingsForm, disputeFinalMessage: e.target.value })} />
                </label>
                <h4><TranslatedText text={"Appeal decision · final outcome"} /></h4>
                <label> <TranslatedText text={"Email subject"} /> <input maxLength={180} value={settingsForm.disputeAppealDecisionEmailSubject} onChange={(e) => setSettingsForm({ ...settingsForm, disputeAppealDecisionEmailSubject: e.target.value })} />
                </label>
                <label> <TranslatedText text={"Message"} /> <textarea rows={3} maxLength={4000} value={settingsForm.disputeAppealDecisionMessage} onChange={(e) => setSettingsForm({ ...settingsForm, disputeAppealDecisionMessage: e.target.value })} />
                </label>
                <button type="button" onClick={() => void saveDisputeMessages()}><TranslatedText text={"Save automated dispute messages"} /></button>
              </section>
              <section className="role-box" style={{ marginTop: "1.25rem" }}>
                <h3><TranslatedText text={"Send a personalized email"} /></h3>
                <p className="muted"><TranslatedText text={"Search for a registered user, then send a one-off message through the configured SMTP account. Moderators need the Email privilege to use this panel."} /></p>
                <div className="action-row">
                  <input
                    aria-label={localizeCopy("Search users by name or email")}
                    value={emailUserSearch}
                    onChange={(e) => {
                      setEmailUserSearch(e.target.value);
                      setEmailRecipients([]);
                      setSelectedEmailRecipientId("");
                    }}
                    placeholder={localizeCopy("Search users by name or email")}
                  />
                  <button type="button" className="secondary" onClick={() => void searchEmailRecipients()}><TranslatedText text={"Search users"} /></button>
                </div>
                {emailRecipients.length > 0 && (
                  <label> <TranslatedText text={"Recipient"} /> <select value={selectedEmailRecipientId} onChange={(e) => setSelectedEmailRecipientId(e.target.value)}>
                      <option value=""><TranslatedText text={"Choose a user"} /></option>
                      {emailRecipients.map((recipient) => (
                        <option key={recipient.id} value={recipient.id}>
                          {recipient.displayName ? `${recipient.displayName} · ` : ""}{recipient.email}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label> <TranslatedText text={"Subject"} /> <input maxLength={180} value={emailMessageSubject} onChange={(e) => setEmailMessageSubject(e.target.value)} />
                </label>
                <label> <TranslatedText text={"Message"} /> <textarea rows={6} maxLength={8000} value={emailMessageBody} onChange={(e) => setEmailMessageBody(e.target.value)} />
                </label>
                <button type="button" disabled={emailSending || !selectedEmailRecipientId} onClick={() => void sendPersonalizedEmail()}>
                  <TranslatedText text={emailSending ? "Sending…" : "Send email"} />
                </button>
              </section>
            </section>
          )}

          {section === "site" && settings && (
            <section className="card-surface">
              <h2><TranslatedText text={"Site & SEO"} /></h2>
              <p className="muted"><TranslatedText text={"Public branding shown in the header, browser tab title, and meta tags."} /></p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveSiteSettings();
                }}
              >
                <label> <TranslatedText text={"Site title"} /> <input
                    value={settingsForm.siteTitle}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteTitle: e.target.value })}
                    placeholder={localizeCopy("2Pescrow — P2P Escrow")}
                  />
                </label>
                <label>
                  <TranslatedText text={"Field notes on home page"} />
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={settingsForm.fieldNotesLimit}
                    onChange={(e) => setSettingsForm({ ...settingsForm, fieldNotesLimit: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                  />
                </label>
                <div className="brand-slot-row">
                  <BrandSlot
                    label={localizeCopy("Logo")}
                    hint="Shown in the header, the footer, emails, and the agreement."
                    value={settingsForm.siteLogoUrl}
                    fallback={DEFAULT_LOGO}
                    wide
                    onChange={(siteLogoUrl) => setSettingsForm({ ...settingsForm, siteLogoUrl })}
                  />
                  <BrandSlot
                    label={localizeCopy("Favicon")}
                    hint="The small icon in the browser tab."
                    value={settingsForm.siteFaviconUrl}
                    fallback={DEFAULT_FAVICON}
                    onChange={(siteFaviconUrl) => setSettingsForm({ ...settingsForm, siteFaviconUrl })}
                  />
                </div>
                <p className="muted"><TranslatedText text={"Replace either image here, then save. Clearing one returns the built-in picture."} /></p>
                <label> <TranslatedText text={"Meta description"} /> <textarea
                    rows={4}
                    value={settingsForm.metaDescription}
                    onChange={(e) => setSettingsForm({ ...settingsForm, metaDescription: e.target.value })}
                    placeholder={localizeCopy("Short description for search engines and social previews.")}
                  />
                  <span className={settingsForm.metaDescription.length > 2000 ? "blog-cms-count over" : "blog-cms-count"}>
                    {settingsForm.metaDescription.length} / 2000
                  </span>
                </label>
                <label> <TranslatedText text={"Meta keywords (optional)"} /> <textarea
                    rows={4}
                    value={settingsForm.metaKeywords}
                    onChange={(e) => setSettingsForm({ ...settingsForm, metaKeywords: e.target.value })}
                    placeholder={localizeCopy("escrow, USDT, Ethereum, P2P")}
                  />
                  <span className={settingsForm.metaKeywords.length > 4000 ? "blog-cms-count over" : "blog-cms-count"}>
                    {settingsForm.metaKeywords.length} / 4000
                  </span>
                </label>
                <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
                <h3 style={{ margin: "0 0 0.35rem" }}><TranslatedText text={"Mobile apps (store links)"} /></h3>
                <p className="muted" style={{ marginTop: 0 }}> <TranslatedText text={"Save App Store and Google Play URLs for when native app download is wired into the site. The public homepage is unchanged until that is implemented."} /> </p>
                <label className="check-row tron-toggle">
                  <input
                    type="checkbox"
                    checked={settingsForm.mobileAppsEnabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, mobileAppsEnabled: e.target.checked })}
                  />
                  <strong><TranslatedText text={"Mobile apps configured (reserved)"} /></strong>
                </label>
                <label> <TranslatedText text={"Apple App Store URL"} /> <input
                    value={settingsForm.iosAppStoreUrl}
                    onChange={(e) => setSettingsForm({ ...settingsForm, iosAppStoreUrl: e.target.value })}
                    placeholder={localizeCopy("https://apps.apple.com/app/id…")}
                    autoComplete="off"
                  />
                </label>
                <label> <TranslatedText text={"Google Play Store URL"} /> <input
                    value={settingsForm.androidPlayStoreUrl}
                    onChange={(e) => setSettingsForm({ ...settingsForm, androidPlayStoreUrl: e.target.value })}
                    placeholder={localizeCopy("https://play.google.com/store/apps/details?id=…")}
                    autoComplete="off"
                  />
                </label>
                <h3 style={{ margin: "1rem 0 0.35rem" }}><TranslatedText text={"Community links"} /></h3>
                <p className="muted" style={{ marginTop: 0 }}> <TranslatedText text={"Shown in the footer, the dock, and the home page. Leave blank to use the network homepages until your rooms are ready."} /> </p>
                <label> <TranslatedText text={"Telegram URL"} /> <input value={settingsForm.telegramUrl} onChange={(e) => setSettingsForm({ ...settingsForm, telegramUrl: e.target.value })} placeholder={localizeCopy("https://t.me/yourroom")} />
                </label>
                <label> <TranslatedText text={"X URL"} /> <input value={settingsForm.xUrl} onChange={(e) => setSettingsForm({ ...settingsForm, xUrl: e.target.value })} placeholder={localizeCopy("https://x.com/yourhandle")} />
                </label>
                <label> <TranslatedText text={"Discord URL"} /> <input value={settingsForm.discordUrl} onChange={(e) => setSettingsForm({ ...settingsForm, discordUrl: e.target.value })} placeholder={localizeCopy("https://discord.gg/yourinvite")} />
                </label>
                <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "1rem 0" }} />
                <h3 style={{ margin: "0 0 0.35rem" }}><TranslatedText text={"Wallet connection pop-up"} /></h3>
                <p className="muted" style={{ marginTop: 0 }}> <TranslatedText text={"Choose which devices see it and how long to wait after a page loads. Mobile means a viewport up to 720px wide. Shown once per browser; saving changes makes the updated notice appear again."} /> </p>
                <label className="check-row tron-toggle">
                  <input
                    type="checkbox"
                    checked={settingsForm.siteNoticeEnabled}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteNoticeEnabled: e.target.checked })}
                  />
                  <strong><TranslatedText text={"Show wallet connection pop-up"} /></strong>
                </label>
                <label> <TranslatedText text={"Show on"} /> <select
                    value={settingsForm.siteNoticeAudience}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteNoticeAudience: e.target.value as "all" | "mobile" | "desktop" })}
                  >
                    <option value="all"><TranslatedText text={"Mobile and desktop"} /></option>
                    <option value="mobile"><TranslatedText text={"Mobile only"} /></option>
                    <option value="desktop"><TranslatedText text={"Desktop only"} /></option>
                  </select>
                </label>
                <label> <TranslatedText text={"Delay after page load (seconds)"} /> <input
                    type="number"
                    min={0}
                    max={300}
                    step={1}
                    value={settingsForm.siteNoticeDelaySeconds}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteNoticeDelaySeconds: Number(e.target.value) })}
                  />
                  <span className="hint"><TranslatedText text={"Set 0 to show immediately, or up to 300 seconds."} /></span>
                </label>
                <label> <TranslatedText text={"Pop-up title"} /> <input
                    value={settingsForm.siteNoticeTitle}
                    maxLength={120}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteNoticeTitle: e.target.value })}
                    placeholder={localizeCopy("Wallet connection help")}
                  />
                </label>
                <label> <TranslatedText text={"Pop-up message"} /> <textarea
                    rows={7}
                    value={settingsForm.siteNoticeBody}
                    maxLength={3000}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteNoticeBody: e.target.value })}
                    placeholder={localizeCopy("Explain wallet connection guidance to visitors.")}
                  />
                  <span className={settingsForm.siteNoticeBody.length > 3000 ? "blog-cms-count over" : "blog-cms-count"}>
                    {settingsForm.siteNoticeBody.length} / 3000
                  </span>
                </label>
                <button type="button" onClick={() => void saveSiteNoticeSettings()}><TranslatedText text={"Save wallet connection pop-up"} /></button>
                <button type="submit"><TranslatedText text={"Save site & SEO"} /></button>
              </form>
            </section>
          )}

          {section === "blog" && <BlogCms />}

          {section === "faq" && <FaqCms />}

          {section === "feedback" && settings && (
            <section className="card-surface">
              <h2><TranslatedText text={"User feedback"} /></h2>
              <p className="muted"> <TranslatedText text={"Signed-in buyers and sellers can submit feedback from the site. Each submission is emailed to"} />{" "} <TranslatedText text={"the platform admin email (ADMIN_EMAIL) when SMTP is configured."} /> </p>
              <label className="check-row tron-toggle" style={{ marginBottom: "1rem" }}>
                <input
                  type="checkbox"
                  checked={settingsForm.feedbackEnabled}
                  onChange={(e) => saveFeedbackEnabled(e.target.checked)}
                />
                <strong><TranslatedText text={"Feedback collection enabled"} /></strong>
                <span className="muted" style={{ display: "block", fontWeight: 400, marginTop: "0.25rem" }}> <TranslatedText text={"When off, the Feedback nav link is hidden and submissions are rejected."} /> </span>
              </label>
              <label> <TranslatedText text={"Show submissions"} /> <select
                  value={feedbackFilter}
                  onChange={(e) => setFeedbackFilter(e.target.value as typeof feedbackFilter)}
                >
                  <option value="new"><TranslatedText text={"New"} /></option>
                  <option value="reviewed"><TranslatedText text={"Reviewed"} /></option>
                  <option value="archived"><TranslatedText text={"Archived"} /></option>
                  <option value="all"><TranslatedText text={"All"} /></option>
                </select>
              </label>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th><TranslatedText text={"When"} /></th>
                      <th><TranslatedText text={"From"} /></th>
                      <th><TranslatedText text={"Category"} /></th>
                      <th><TranslatedText text={"Message"} /></th>
                      <th><TranslatedText text={"Status"} /></th>
                      <th><TranslatedText text={"Actions"} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackItems.map((f) => (
                      <tr key={f.id}>
                        <td>{new Date(f.createdAt).toLocaleString()}</td>
                        <td>
                          {f.displayName || f.email || "—"}
                          {f.email ? <div className="muted">{f.email}</div> : null}
                          {f.pagePath ? <div className="mono muted">{f.pagePath}</div> : null}
                          {f.emailSent ? null : <div className="muted"><TranslatedText text={"Email not sent"} /></div>}
                        </td>
                        <td>{f.category.replace(/_/g, " ")}</td>
                        <td>
                          {f.subject ? <strong>{f.subject}</strong> : null}
                          <div style={{ whiteSpace: "pre-wrap", maxWidth: "28rem" }}>{f.message}</div>
                          {f.adminNote ? <div className="muted"><TranslatedText text={"Note:"} /> {f.adminNote}</div> : null}
                        </td>
                        <td>{f.status}</td>
                        <td>
                          <div className="action-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                            {f.status === "new" && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={async () => {
                                  await api(`/v1/admin/feedback/${f.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json", ...headers() },
                                    body: JSON.stringify({ status: "reviewed" }),
                                  });
                                  setMsg("Marked reviewed.");
                                  await refresh();
                                }}
                              > <TranslatedText text={"Mark reviewed"} /> </button>
                            )}
                            {f.status !== "archived" && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={async () => {
                                  await api(`/v1/admin/feedback/${f.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json", ...headers() },
                                    body: JSON.stringify({ status: "archived" }),
                                  });
                                  setMsg("Archived.");
                                  await refresh();
                                }}
                              > <TranslatedText text={"Archive"} /> </button>
                            )}
                            <button
                              type="button"
                              className="secondary"
                              onClick={async () => {
                                const note = window.prompt("Admin note (optional)", f.adminNote || "");
                                if (note === null) return;
                                await api(`/v1/admin/feedback/${f.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", ...headers() },
                                  body: JSON.stringify({ adminNote: note || null }),
                                });
                                await refresh();
                              }}
                            > <TranslatedText text={"Add note"} /> </button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={async () => {
                                if (!window.confirm("Delete this feedback permanently?")) return;
                                await api(`/v1/admin/feedback/${f.id}`, {
                                  method: "DELETE",
                                  headers: headers(),
                                });
                                setMsg("Deleted.");
                                await refresh();
                              }}
                            > <TranslatedText text={"Delete"} /> </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {feedbackItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted"> <TranslatedText text={"No feedback in this filter."} /> </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
