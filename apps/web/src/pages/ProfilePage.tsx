import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { mainnet } from "viem/chains";
import { api, formatAmount, shortAddr } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Link, useRouter } from "../lib/router";
import { useWorkspaceGuard } from "../lib/useWorkspaceGuard";
import { ConnectEvmWalletButton } from "../lib/evmWalletPicker";
import { usePlatformSettings } from "../lib/platformSettings";
import { useTronWallet } from "../lib/tron/TronWalletContext";
import { useLanguage } from "../lib/language";
import { useLiveNotifications } from "../lib/liveNotifications";
import { CopyButton } from "../components/CopyButton";
import { requestSwitchToEthereum } from "../lib/switchToEthereum";
import { userDisplayLabel } from "../lib/userDisplay";

type ReferralSummary = {
  enrolled: boolean;
  referralUrl?: string;
  successfulReferrals?: number;
  pendingBalanceAtomic?: string;
  referees?: { email: string | null; joinedAt: string }[];
};

export function ProfilePage() {
  const { authHeaders, refresh, signOut, user: authUser } = useAuth();
  const { user, ready } = useWorkspaceGuard();
  const { navigate } = useRouter();
  const { address, connector, isConnected, chainId } = useAccount();
  const [switchingChain, setSwitchingChain] = useState(false);
  const { settings } = usePlatformSettings();
  const tron = useTronWallet();
  const { t } = useLanguage();
  const { setSoundEnabled, soundEnabled } = useLiveNotifications();
  const [referral, setReferral] = useState<ReferralSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReferral(await api<ReferralSummary>("/v1/me/referral", { headers: authHeaders() }));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!ready || !user) return;
    load();
  }, [ready, user, load]);

  useEffect(() => {
    if (!authUser || editingName) return;
    setNameDraft(authUser.displayName?.trim() || "");
  }, [authUser, editingName]);

  async function saveDisplayName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setErr(t("Enter a display name."));
      return;
    }
    setSavingName(true);
    setErr(null);
    setNameMsg(null);
    try {
      await api("/v1/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ displayName: trimmed }),
      });
      await refresh();
      setEditingName(false);
      setNameMsg(t("Display name saved."));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  }

  async function linkWallet(kind: "evm" | "tron") {
    if (kind === "evm" && chainId !== mainnet.id) {
      setErr(t("Switch your connected wallet to Ethereum before linking it."));
      return;
    }
    const addr = kind === "tron" ? tron.address : address;
    if (!addr) return;
    try {
      await api("/v1/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ address: addr, chainKind: kind }),
      });
      setLinkMsg(`${t("Saved to profile")}: ${shortAddr(addr)} (${kind})`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  if (!ready || !user) return <p className="muted">{t("Loading…")}</p>;

  const linked = authUser?.wallets || [];

  return (
    <div className="page profile-page">
      <div className="page-head profile-page-head">
        <div>
          <p className="eyebrow">{t("Profile")}</p>
          <h1>{userDisplayLabel(authUser)}</h1>
          {authUser?.email && authUser.displayName?.trim() && (
            <p className="muted profile-page-email">{authUser.email}</p>
          )}
          <p className="muted">{t("Saved wallets, live alerts, and referral earnings.")}</p>
        </div>
        <div className="profile-head-actions">
          <button type="button" className="secondary" onClick={() => signOut()}>
            {t("Sign out")}
          </button>
        </div>
      </div>

      {err && <p className="error-banner">{err}</p>}
      {linkMsg && <p className="ok-banner">{linkMsg}</p>}
      {nameMsg && <p className="ok-banner">{nameMsg}</p>}

      <section className="card-surface profile-display-name-card">
        <div className="profile-display-name-head">
          <div>
            <h2 style={{ marginTop: 0 }}>{t("Display name")}</h2>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              {t("Shown on your dashboard, in the header, and to buyers and sellers on your trades.")}
            </p>
          </div>
          {!editingName && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setNameDraft(authUser?.displayName?.trim() || "");
                setEditingName(true);
                setNameMsg(null);
              }}
            >
              {t("Edit")}
            </button>
          )}
        </div>
        {editingName ? (
          <div className="profile-display-name-form">
            <label>
              <span>{t("Display name")}</span>
              <input
                value={nameDraft}
                maxLength={80}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveDisplayName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameDraft(authUser?.displayName?.trim() || "");
                  }
                }}
              />
            </label>
            <div className="action-row">
              <button type="button" disabled={savingName} onClick={() => void saveDisplayName()}>
                {savingName ? t("Saving…") : t("Save name")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={savingName}
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(authUser?.displayName?.trim() || "");
                }}
              >
                {t("Cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className="profile-display-name-value">
            <strong>{userDisplayLabel(authUser, "—")}</strong>
            {!authUser?.displayName?.trim() && authUser?.email && (
              <span className="muted profile-display-name-hint">
                {" "}
                {t("Showing your email until you set a custom display name.")}
              </span>
            )}
          </p>
        )}
      </section>

      <section className="card-surface wallet-link-bar">
        <div>
          <strong>{t("Saved wallets")}</strong>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {t(
              "Connect a wallet, then save it to your profile. Trades you join or create stay linked to your account even if you switch wallets later.",
            )}
          </p>
        </div>
        {linked.length > 0 && (
          <ul className="profile-wallet-list">
            {linked.map((w) => (
              <li key={w.id} className="mono">
                {w.address}
              </li>
            ))}
          </ul>
        )}
        <div className="wallet-link-actions">
          {!isConnected ? (
            <ConnectEvmWalletButton>{t("Connect wallet")}</ConnectEvmWalletButton>
          ) : (
            <>
              <span className="mono wallet-connected-addr" title={address}>
                {shortAddr(address!)}
              </span>
              {chainId === mainnet.id ? (
                <button type="button" onClick={() => linkWallet("evm")}>
                  {t("Save Ethereum wallet")}
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  disabled={switchingChain}
                  onClick={() => {
                    setErr(null);
                    setSwitchingChain(true);
                    void requestSwitchToEthereum(connector)
                      .catch((e) => setErr(e instanceof Error ? e.message : "The wallet did not switch to Ethereum."))
                      .finally(() => setSwitchingChain(false));
                  }}
                >
                  {switchingChain ? t("Switching…") : t("Switch wallet to Ethereum")}
                </button>
              )}
            </>
          )}
          {settings?.tronSupportEnabled &&
            (tron.address ? (
              <button type="button" className="secondary" onClick={() => linkWallet("tron")}>
                {t("Save Tron wallet")} {shortAddr(tron.address)}
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => void tron.connect()} disabled={tron.connecting}>{t("Connect a TRON wallet to save it to your profile.")}</button>
            ))}
        </div>
      </section>

      {settings?.feedbackEnabled && (
        <section className="card-surface profile-feedback-card">
          <p className="eyebrow">{t("Feedback")}</p>
          <h2 style={{ marginTop: 0 }}>{t("Send feedback")}</h2>
          <p className="muted">{t("Report bugs, suggest improvements, or tell us how the trade room feels on your device.")}</p>
          <Link to="/feedback" className="profile-feedback-link">
            {t("Open feedback form")}
          </Link>
        </section>
      )}

      <section className="card-surface">
        <h2 style={{ marginTop: 0 }}>{t("Live alerts")}</h2>
        <label className="check-row">
          <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
          {t("Play a bell sound when your trades update (wallet linked, new phase, messages).")}
        </label>
        <p className="muted">{t("Use the bell icon in the header on any page to review recent alerts.")}</p>
      </section>

      <section className="card-surface referral-promo">
        <p className="eyebrow">{t("Referral program")}</p>
        {!referral?.enrolled ? (
          <>
            <h2>{t("Earn 2% when your traders succeed")}</h2>
            <p className="muted">{t("Share one link. Track signups, conversions, and cash out from the referrals page.")}</p>
            <button type="button" onClick={() => navigate("/referrals")}>
              {t("Become a referrer")}
            </button>
          </>
        ) : (
          <>
            <h2>{t("Your referrer stats")}</h2>
            {referral.referralUrl && (
              <label className="profile-referral-link">
                <span>{t("Your link")}</span>
                <input readOnly value={referral.referralUrl} onFocus={(e) => e.currentTarget.select()} />
              </label>
            )}
            <dl className="kv">
              <dt>{t("People who signed up via your link")}</dt>
              <dd>{referral.referees?.length ?? 0}</dd>
              <dt>{t("Converted (completed trades)")}</dt>
              <dd>{referral.successfulReferrals ?? 0}</dd>
              <dt>{t("Pending payout")}</dt>
              <dd>{formatAmount(referral.pendingBalanceAtomic || "0")}</dd>
            </dl>
            <div className="action-row">
              {referral.referralUrl && (
                <CopyButton text={referral.referralUrl} className="" label={t("Copy link")} copiedLabel={t("Link copied")} />
              )}
              <button type="button" className="secondary" onClick={() => navigate("/referrals")}>
                {t("Payouts & cash out")}
              </button>
              <button type="button" className="secondary" onClick={() => navigate("/app")}>
                {t("Dashboard")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
