import { TranslatedText } from "../lib/language";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { api, formatAmount, shortAddr } from "../lib/api";
import { useLiveTradeUpdates } from "../lib/useLiveTradeUpdates";
import { useLiveNotifications } from "../lib/liveNotifications";
import { useRouter } from "../lib/router";
import { StatusBadge } from "../components/StatusBadge";
import type { Escrow } from "../lib/types";
import { ChainBadge } from "../components/ChainBadge";
import { useLanguage } from "../lib/language";
import { useAuth } from "../lib/auth";
import { useTradeListWindow } from "../lib/useTradeListWindow";
import { TradePartyBadge } from "../components/TradePartyBadge";
import { TradeRoleTags } from "../components/TradeRoleTags";
import { userDisplayLabel } from "../lib/userDisplay";

const EMPTY_TRADES: Escrow[] = [];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type CategoryFilter = "all" | "open" | "completed" | "disputed";

function tradeDate(row: Escrow): Date | null {
  const raw = row.createdAt || row.updatedAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function csvEscape(value: string) {
  const safe = value.replace(/\r?\n/g, " ");
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function downloadTradesCsv(items: Escrow[], filename: string) {
  const header = ["Date", "Title", "Status", "Amount", "Token", "Chain", "Buyer", "Seller", "Contract"].join(",");
  const lines = items.map((item) => {
    const dt = tradeDate(item);
    return [
      dt ? dt.toISOString() : "",
      item.title || "",
      item.status || "",
      formatAmount(item.amountAtomic),
      item.tokenSymbol === "TRON_USDT" ? "USDT" : item.tokenSymbol || "",
      item.chain === "tron" ? "Tron" : "Ethereum",
      userDisplayLabel(item.buyerUser) || item.buyerAddress || "",
      userDisplayLabel(item.sellerUser) || item.sellerAddress || "",
      item.contractAddress || "",
    ].map(csvEscape).join(",");
  });
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TradesPage() {
  const { address } = useAccount();
  const { user, authHeaders } = useAuth();
  const { navigate, search } = useRouter();
  const { t } = useLanguage();
  const { syncEscrowIds } = useLiveNotifications();
  const showPublicLedger = new URLSearchParams(search).get("view") === "public";
  const scope = showPublicLedger ? "public" : user ? `mine:${user.id}` : "signed-out";
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const requestId = useRef(0);
  const [result, setResult] = useState<{ scope: string; escrows: Escrow[] } | null>(null);
  const escrows = result?.scope === scope ? result.escrows : EMPTY_TRADES;
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const load = useCallback(async () => {
    const id = ++requestId.current;
    if (!showPublicLedger && !user) {
      setResult(null);
      setError(null);
      return;
    }
    try {
      const rows = showPublicLedger
        ? await api<Escrow[]>("/v1/escrows")
        : await api<Escrow[]>("/v1/me/trades", { headers: authHeaders() });
      if (id !== requestId.current || activeScope.current !== scope) return;
      setResult({ scope, escrows: rows });
      setError(null);
    } catch (e) {
      if (id !== requestId.current || activeScope.current !== scope) return;
      setError(e instanceof Error ? e.message : t("Failed to load"));
    }
  }, [showPublicLedger, user, authHeaders, t, scope]);

  useLiveTradeUpdates(load, { enabled: Boolean(user) || showPublicLedger });

  useEffect(() => {
    syncEscrowIds(escrows.map((e) => e.id));
  }, [escrows, syncEscrowIds]);

  useEffect(() => {
    load();
  }, [load]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const row of escrows) {
      const dt = tradeDate(row);
      if (dt) years.add(dt.getFullYear());
    }
    const list = Array.from(years).sort((a, b) => b - a);
    return list.length > 0 ? list : [new Date().getFullYear()];
  }, [escrows]);

  const filtered = useMemo(() => {
    const yrNum = selectedYear ? Number(selectedYear) : null;
    const moNum = selectedMonth !== "" ? Number(selectedMonth) : null;
    return escrows.filter((item) => {
      if (category === "open" && ["Completed", "Resolved", "Cancelled"].includes(item.status)) return false;
      if (category === "completed" && !["Completed", "Resolved"].includes(item.status)) return false;
      if (category === "disputed" && item.status !== "Disputed") return false;
      if (yrNum !== null) {
        const dt = tradeDate(item);
        if (!dt || dt.getFullYear() !== yrNum) return false;
        if (moNum !== null && dt.getMonth() !== moNum) return false;
      }
      return true;
    });
  }, [escrows, category, selectedYear, selectedMonth]);

  const tradeWindow = useTradeListWindow(
    filtered,
    `${showPublicLedger ? "public" : "mine"}:${category}:${selectedYear}:${selectedMonth}`,
  );

  function handleExportCsv() {
    if (filtered.length === 0) return;
    const suffix = !selectedYear
      ? "all"
      : selectedMonth === ""
        ? selectedYear
        : `${selectedYear}-${String(Number(selectedMonth) + 1).padStart(2, "0")}`;
    downloadTradesCsv(filtered, `2pescrow-${showPublicLedger ? "ledger" : "trades"}-${suffix}.csv`);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{!showPublicLedger ? t("My trades") : t("Trades")}</h1>
          <p className="muted">
            {!showPublicLedger
              ? t("Every trade where you are buyer, seller, or linked by wallet.")
              : t("All escrow deals on the platform ledger, by chain.")}
          </p>
        </div>
        <button type="button" onClick={() => navigate("/trades/new")}>
          {t("Start a trade")}
        </button>
        <button type="button" className="secondary" onClick={() => navigate("/join")}>
          {t("Join a trade")}
        </button>
      </div>

      <label className="check-row">
        <input type="checkbox" checked={showPublicLedger} onChange={(e) => navigate(e.target.checked ? "/trades?view=public" : "/trades")} />
        {t("Show public platform ledger")}
      </label>

      {(user || showPublicLedger) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            margin: "0.75rem 0 1rem",
            padding: "0.65rem 0.8rem",
            borderRadius: "12px",
            border: "1px solid var(--border)",
            background: "rgba(10, 22, 32, 0.65)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {(["all", "open", "completed", "disputed"] as const).map((key) => {
              const active = category === key;
              const label = key === "all" ? t("All") : key === "open" ? t("Open") : key === "completed" ? t("Completed") : t("Disputed");
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? "" : "secondary"}
                  style={{ padding: "0.35rem 0.7rem", fontSize: "0.82rem", borderRadius: "999px" }}
                  onClick={() => setCategory(key)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center", marginLeft: "auto" }}>
            <select
              aria-label={t("Filter by year")}
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(e.target.value);
                if (!e.target.value) setSelectedMonth("");
              }}
              style={{ width: "auto", margin: 0, padding: "0.38rem 0.6rem", fontSize: "0.82rem" }}
            >
              <option value="">{t("All years")}</option>
              {availableYears.map((yr) => (
                <option key={yr} value={String(yr)}>{yr}</option>
              ))}
            </select>
            {selectedYear && (
              <select
                aria-label={t("Filter by month")}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ width: "auto", margin: 0, padding: "0.38rem 0.6rem", fontSize: "0.82rem" }}
              >
                <option value="">{t("All months")}</option>
                {MONTH_NAMES.map((mName, idx) => (
                  <option key={mName} value={String(idx)}>{mName}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="secondary"
              disabled={filtered.length === 0}
              onClick={handleExportCsv}
              style={{ padding: "0.38rem 0.7rem", fontSize: "0.82rem" }}
            >
              {t("Export CSV")}
            </button>
          </div>
        </div>
      )}

      {!user && !showPublicLedger && (
        <p className="muted">
          {t("Sign in to see all your trades")} · {address ? shortAddr(address) : t("(connect wallet)")}
        </p>
      )}

      {error && <p className="error-banner"><TranslatedText text={error} /></p>}

      {(user || showPublicLedger) && filtered.length === 0 && !error && (
        <div className="empty card-surface">
          <p>{escrows.length > 0 ? t("No trades match this filter.") : t("No trades yet.")}</p>
          {escrows.length === 0 && (
            <button type="button" onClick={() => navigate("/trades/new")}>
              {t("Start a trade")}
            </button>
          )}
        </div>
      )}

      <div className="trade-table">
        {tradeWindow.visible.map((e) => (
          <button key={e.id} type="button" className="trade-row" onClick={() => navigate(`/trades/${e.id}`)}>
            <span className="trade-row-main">
              <strong>{e.title}</strong>
              {user && <TradePartyBadge escrow={e} userId={user.id} walletAddresses={user.wallets?.map((wallet) => wallet.address)} />}
            </span>
            <div className="trade-card-badges">
              <TradeRoleTags
                buyer={userDisplayLabel(e.buyerUser) || (e.buyerAddress ? shortAddr(e.buyerAddress) : "")}
                seller={userDisplayLabel(e.sellerUser) || (e.sellerAddress ? shortAddr(e.sellerAddress) : "")}
              />
              <ChainBadge chain={e.chain} />
              <StatusBadge status={e.status} />
            </div>
          </button>
        ))}
      </div>
      {tradeWindow.showMore && (
        <button type="button" className="secondary trade-list-view-more" onClick={tradeWindow.expand}>
          {t("Load more")} ({tradeWindow.hiddenCount})
        </button>
      )}
    </div>
  );
}
