import { useCallback, useEffect, useState } from "react";
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

export function TradesPage() {
  const { address } = useAccount();
  const { user, authHeaders } = useAuth();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const { syncEscrowIds } = useLiveNotifications();
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [showPublicLedger, setShowPublicLedger] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (user && !showPublicLedger) {
        setEscrows(await api<Escrow[]>("/v1/me/trades", { headers: authHeaders() }));
      } else {
        const q = address ? `?wallet=${address}` : "";
        setEscrows(await api<Escrow[]>(`/v1/escrows${q}`));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Failed to load"));
    }
  }, [address, showPublicLedger, user, authHeaders, t]);

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
          <h1>{user && !showPublicLedger ? t("My trades") : t("Trades")}</h1>
          <p className="muted">
            {user && !showPublicLedger
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

      {user ? (
        <label className="check-row">
          <input type="checkbox" checked={showPublicLedger} onChange={(e) => setShowPublicLedger(e.target.checked)} />
          {t("Show public platform ledger")}
        </label>
      ) : (
        <p className="muted">
          {t("Sign in to see all your trades")} · {address ? shortAddr(address) : t("(connect wallet)")}
        </p>
      )}

      {error && <p className="error-banner">{error}</p>}

      {escrows.length === 0 && !error && (
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
