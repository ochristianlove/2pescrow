import { TranslatedText } from "../lib/language";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { api, shortAddr } from "../lib/api";
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

  const tradeWindow = useTradeListWindow(escrows, showPublicLedger ? "public" : "mine");

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
      {!user && !showPublicLedger && (
        <p className="muted">
          {t("Sign in to see all your trades")} · {address ? shortAddr(address) : t("(connect wallet)")}
        </p>
      )}

      {error && <p className="error-banner"><TranslatedText text={error} /></p>}

      {(user || showPublicLedger) && escrows.length === 0 && !error && (
        <div className="empty card-surface">
          <p>{t("No trades yet.")}</p>
          <button type="button" onClick={() => navigate("/trades/new")}>
            {t("Start a trade")}
          </button>
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
          {t("Click to view more")} ({tradeWindow.hiddenCount})
        </button>
      )}
    </div>
  );
}
