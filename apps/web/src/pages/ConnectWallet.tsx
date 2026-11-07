import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectEvmWalletButton } from "../lib/evmWalletPicker";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { useTronWallet } from "../lib/tron/TronWalletContext";
import { usePlatformSettings } from "../lib/platformSettings";
import { userHasLinkedWallet, workspaceEntryPath } from "../lib/workspaceGate";
import { useLanguage } from "../lib/language";
import { userDisplayLabel } from "../lib/userDisplay";

function returnToPath(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("returnTo");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return workspaceEntryPath(null);
  return raw;
}

export function ConnectWalletPage() {
  const { user, loading, authHeaders, refresh } = useAuth();
  const { navigate } = useRouter();
  const { t } = useLanguage();
  const { settings } = usePlatformSettings();
  const { address, isConnected } = useAccount();
  const tron = useTronWallet();
  const tronEnabled = !!settings?.tronSupportEnabled;
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const linkedEvm = useRef<string | null>(null);
  const linkedTron = useRef<string | null>(null);

  const destination = returnToPath();

  const tryFinish = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/signin");
      return;
    }
    if (userHasLinkedWallet(user)) {
      navigate(destination === "/connect-wallet" ? workspaceEntryPath(user) : destination);
    }
  }, [loading, user, navigate, destination]);

  async function linkAddress(addr: string, chainKind: "evm" | "tron") {
    setLinking(true);
    setErr(null);
    try {
      await api("/v1/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ address: addr, chainKind }),
      });
      setMsg(chainKind === "tron" ? t("Tron wallet linked.") : t("Ethereum wallet linked."));
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  useEffect(() => {
    if (!user || linking || userHasLinkedWallet(user)) return;
    if (!isConnected || !address || linkedEvm.current === address) return;
    linkedEvm.current = address;
    linkAddress(address, "evm").catch(() => undefined);
  }, [isConnected, address, user, linking]);

  useEffect(() => {
    if (!tronEnabled || !user || linking || userHasLinkedWallet(user)) return;
    if (!tron.address || linkedTron.current === tron.address) return;
    linkedTron.current = tron.address;
    linkAddress(tron.address, "tron").catch(() => undefined);
  }, [tronEnabled, tron.address, user, linking]);

  if (loading || !user) return <p className="muted">{t("Loading…")}</p>;

  return (
    <div className="page narrow">
      <p className="eyebrow">{t("One more step")}</p>
      <h1>{t("Connect your wallet")}</h1>
      <p className="muted">
        {t("Signed in as")} <strong>{userDisplayLabel(user)}</strong>. {t("Link an Ethereum wallet to continue.")}
      </p>

      {err && <p className="error-banner">{err}</p>}
      {msg && <p className="ok-banner">{msg}</p>}
      {linking && <p className="muted">{t("Linking wallet to your account…")}</p>}

      <section className="card-surface" style={{ marginTop: "1rem" }}>
        <p className="eyebrow">{t("Ethereum")}</p>
        {!isConnected ? (
          <ConnectEvmWalletButton>{t("Connect wallet")}</ConnectEvmWalletButton>
        ) : (
          <p className="muted">
            {t("Connected")}: <code>{address}</code>
          </p>
        )}
      </section>

      {tronEnabled && (
        <section className="card-surface" style={{ marginTop: "1rem" }}>
          <p className="eyebrow">{t("Tron (optional)")}</p>
          <p className="muted">{t("Only if you trade on TRON. Connect any supported TRON wallet here or from the header.")}</p>
          {!tron.address ? (
            <button type="button" className="secondary" disabled={tron.connecting} onClick={() => void tron.connect()}>
              {tron.connecting ? t("Opening wallet options…") : t("Connect TRON wallet")}
            </button>
          ) : (
            <p className="ok-banner">
              {tron.walletName || "TRON wallet"} · <code>{tron.address}</code>
            </p>
          )}
          {tron.error && <p className="error-banner">{tron.error}</p>}
        </section>
      )}

      <button type="button" className="linkish" style={{ marginTop: "1.5rem" }} onClick={() => tryFinish()}>
        {t("Refresh status")}
      </button>
    </div>
  );
}
