import { useLanguage as useCopyLanguage } from "../lib/language";
import { TranslatedText } from "../lib/language";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  clearCreateTradeDraft,
  defaultCreateTradeForm,
  loadCreateTradeDraft,
  saveCreateTradeDraft,
} from "../lib/createTradeDraft";
import { useAccount } from "wagmi";
import { mainnet } from "viem/chains";
import { ConnectEvmWalletButton } from "../lib/evmWalletPicker";
import { EvmWrongChainBanner } from "../components/EvmWrongChainBanner";
import { parseUnits } from "viem";
import { api, formatAmount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRouter } from "../lib/router";
import { useWorkspaceGuard } from "../lib/useWorkspaceGuard";
import { usePlatformSettings } from "../lib/platformSettings";
import { useTronWallet } from "../lib/tron/TronWalletContext";
import { useLanguage } from "../lib/language";
import { CopyButton } from "../components/CopyButton";
import { BlogEditor } from "../components/BlogEditor";
import { ContractTerms } from "../components/ContractTerms";
import { plainText } from "../components/blogBody";
import {
  TradeWindowPicker,
  clampTradeWindowHours,
  formatTradeWindowHours,
  TRADE_WINDOW_MAX_HOURS,
  TRADE_WINDOW_MIN_HOURS,
} from "../components/TradeWindowPicker";

type CreatedTrade = { id: string; tradeCode: string };

const DELIVERY_PRESET_HOURS = [72, 168, 336, 720] as const;
const PROTECTION_PRESET_HOURS = [168, 336, 720] as const;

export function CreateTradePage() {
  const { t: localizeCopy } = useCopyLanguage();
  const { address: evmAddress, isConnected, chainId } = useAccount();
  const tron = useTronWallet();
  const { settings } = usePlatformSettings();
  const { navigate } = useRouter();
  const { user, ready } = useWorkspaceGuard();
  const { authHeaders, refresh } = useAuth();
  const { t } = useLanguage();
  const initialDraft = useMemo(() => loadCreateTradeDraft(true), []);
  const [step, setStep] = useState<1 | 2>(initialDraft?.step ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTrade | null>(null);
  const [draftRestoredBanner, setDraftRestoredBanner] = useState(!!initialDraft);
  const [form, setForm] = useState(() => initialDraft?.form ?? defaultCreateTradeForm());
  const tronEnabled = !!settings?.tronSupportEnabled;
  const evmOnEthereum = isConnected && chainId === mainnet.id;

  const deliveryPresets = useMemo(
    () =>
      DELIVERY_PRESET_HOURS.map((hours) => ({
        hours,
        label:
          hours === 72
            ? t("3 days")
            : hours === 168
              ? t("7 days")
              : hours === 336
                ? t("14 days")
                : t("30 days"),
      })),
    [t],
  );

  const protectionPresets = useMemo(
    () =>
      PROTECTION_PRESET_HOURS.map((hours) => ({
        hours,
        label: hours === 168 ? t("7 days") : hours === 336 ? t("14 days") : t("30 days"),
      })),
    [t],
  );

  useEffect(() => {
    if (tronEnabled || form.chain !== "tron") return;
    setForm((prev) => ({ ...prev, chain: "ethereum", tokenSymbol: "USDT" }));
  }, [tronEnabled, form.chain]);

  useEffect(() => {
    if (!ready || !user || created) return;
    saveCreateTradeDraft({ step, form });
  }, [step, form, ready, user, created]);

  useEffect(() => {
    if (step !== 2) return;
    if (form.chain === "ethereum" && evmOnEthereum) setError(null);
    if (form.chain === "tron" && tron.address) setError(null);
  }, [step, form.chain, evmOnEthereum, tron.address]);

  function discardDraft() {
    if (!window.confirm(t("Discard this draft? Your saved trade details on this device will be cleared."))) return;
    clearCreateTradeDraft();
    setStep(1);
    setForm(defaultCreateTradeForm());
    setError(null);
    setDraftRestoredBanner(false);
  }
  const buyerAddress = form.chain === "tron" ? tron.address : evmOnEthereum ? evmAddress : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) {
      if (!form.title.trim() || !form.amount || Number(form.amount) <= 0) {
        setError("Add a title and a valid amount to continue.");
        return;
      }
      if (!plainText(form.description)) {
        setError(t("Contract terms are required. Describe what is being delivered and what counts as fulfilment."));
        return;
      }
      setError(null);
      setStep(2);
      return;
    }
    if (!plainText(form.description)) {
      setError(t("Contract terms are required. Describe what is being delivered and what counts as fulfilment."));
      return;
    }
    const deliveryH = clampTradeWindowHours(form.deliveryWindowHours);
    const reviewH = clampTradeWindowHours(form.reviewWindowHours);
    if (deliveryH < TRADE_WINDOW_MIN_HOURS || deliveryH > TRADE_WINDOW_MAX_HOURS) {
      setError(t("Choose a delivery window between 1 and 90 days."));
      return;
    }
    if (reviewH < TRADE_WINDOW_MIN_HOURS || reviewH > TRADE_WINDOW_MAX_HOURS) {
      setError(t("Choose a buyer protection period between 1 and 90 days."));
      return;
    }
    if (!user) return navigate("/signin");
    if (form.chain === "ethereum" && !evmOnEthereum) {
      setError(isConnected ? "Your wallet is connected to the wrong network. Switch to Ethereum before creating this trade." : "Connect an Ethereum wallet before creating this trade.");
      return;
    }
    if (form.chain === "tron" && !tron.address) {
      setError("Connect a TRON wallet before creating a TRC-20 trade.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let linkedBuyerAddress: string | undefined;
      if (buyerAddress) {
        const alreadyLinked = user.wallets?.some((wallet) => wallet.address.toLowerCase() === buyerAddress.toLowerCase());
        if (!alreadyLinked) {
          await api("/v1/auth/link-wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ address: buyerAddress, chainKind: form.chain === "tron" ? "tron" : "evm" }),
          });
          await refresh();
        }
        linkedBuyerAddress = buyerAddress;
      }
      const amountAtomic = parseUnits(form.amount, 6).toString();
      const trade = await api<CreatedTrade>("/v1/escrows", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          codeFlow: true,
          chain: form.chain,
          buyerAddress: linkedBuyerAddress,
          tokenSymbol: form.tokenSymbol,
          amountAtomic,
          title: form.title.trim(),
          description: form.description.trim(),
          deliveryWindowHours: deliveryH,
          reviewWindowHours: reviewH,
        }),
      });
      clearCreateTradeDraft();
      setCreated(trade);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user) return <p className="muted"><TranslatedText text={"Loading your trade workspace…"} /></p>;

  if (created) {
    return (
      <div className="page narrow">
        <p className="eyebrow">{t("Trade invitation ready")}</p>
        <h1>{t("Share this join code")}</h1>
        <p className="muted">{t("Your trade is saved. The seller joins with this code and their account becomes the other party on the same trade.")}</p>
        <section className="card-surface invite-code-card">
          <span className="stat-label">{t("Seller join code")}</span>
          <strong className="invite-code">{created.tradeCode}</strong>
          <CopyButton text={created.tradeCode} className="secondary" />
        </section>
        <div className="action-row">
          <button type="button" onClick={() => navigate(`/trades/${created.id}`)}>{t("Open shared trade room")}</button>
          <button type="button" className="secondary" onClick={() => navigate("/app")}>{t("Go to dashboard")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page trade-create-page">
      <div className="page-head trade-create-head">
        <div>
          <p className="eyebrow">{t("Buyer · New protected trade")}</p>
          <h1>{t("Start a trade")}</h1>
          <p className="muted">{t("Set the deal terms, then invite the seller to join your shared trade room.")}</p>
        </div>
        <div className="hero-actions">
          <span className="step-count"><TranslatedText text={"Step"} /> {step} <TranslatedText text={"of 2"} /></span>
          {(form.title.trim() || plainText(form.description) || form.amount || step === 2) && (
            <button type="button" className="secondary" onClick={discardDraft}>
              {t("Discard draft")}
            </button>
          )}
        </div>
      </div>

      {draftRestoredBanner && (
        <p className="ok-banner">
          {t("We restored your in-progress trade details from this browser.")}{" "}
          <button type="button" className="linkish" onClick={() => setDraftRestoredBanner(false)}> <TranslatedText text={"OK"} /> </button>
        </p>
      )}

      <div className="trade-create-grid">
        <form className="card-surface form-stack trade-create-form" onSubmit={submit}>
          <div className="wizard-steps" aria-label={localizeCopy("Escrow creation steps")}>
            <span className={step === 1 ? "current" : "complete"}>1 <b>{t("Deal details")}</b></span>
            <i />
            <span className={step === 2 ? "current" : ""}>2 <b>{t("Review & invite")}</b></span>
          </div>

          {step === 1 ? (
            <>
              <label>
                {t("Trade title")}
                <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={localizeCopy("e.g. Vintage camera")} />
              </label>
              <div className="terms-field">
                <span className="terms-field-label">{t("Contract terms")}</span>
                <BlogEditor
                  tools="terms"
                  html={form.description}
                  onChange={(description) => setForm({ ...form, description })}
                />
                <small className="hint">{t("These terms stay visible to both parties in the trade room. Use headings, bold, and links so the agreement is easy to read.")}</small>
              </div>
              <div className="settlement-options">
                <p className="trade-window-label" id="settlement-network-label">{t("Settlement network")}</p>
                <div className={`settlement-grid${tronEnabled ? "" : " settlement-grid-single"}`} role="radiogroup" aria-labelledby="settlement-network-label">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.chain === "ethereum"}
                    className={`settlement-card${form.chain === "ethereum" ? " is-selected" : ""}`}
                    onClick={() => setForm({ ...form, chain: "ethereum", tokenSymbol: form.tokenSymbol === "USDC" ? "USDC" : "USDT" })}
                  >
                    <span className="eyebrow">{t("Ethereum")}</span>
                    <h3>{t("Ethereum")}</h3>
                    <p>{t("USDC and USDT are the token contracts on Ethereum. Funds stay on Ethereum.")}</p>
                  </button>
                  {tronEnabled && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.chain === "tron"}
                      className={`settlement-card${form.chain === "tron" ? " is-selected" : ""}`}
                      onClick={() => setForm({ ...form, chain: "tron", tokenSymbol: "TRON_USDT" })}
                    >
                      <span className="eyebrow">{t("Tron")}</span>
                      <h3><TranslatedText text={"TRC-20 USDT"} /></h3>
                      <p>{t("The buyer funds with Tron USDT. That balance stays on Tron.")}</p>
                    </button>
                  )}
                </div>
                {form.chain === "ethereum" && (
                  <div className="ethereum-token-options">
                    <p className="trade-window-label" id="ethereum-token-label">{t("Token on Ethereum")}</p>
                    <div className="settlement-grid" role="radiogroup" aria-labelledby="ethereum-token-label">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.tokenSymbol === "USDT"}
                        className={`settlement-card${form.tokenSymbol === "USDT" ? " is-selected" : ""}`}
                        onClick={() => setForm({ ...form, chain: "ethereum", tokenSymbol: "USDT" })}
                      >
                        <span className="eyebrow">{t("Ethereum contract")}</span>
                        <h3>USDT</h3>
                        <p>{t("Direct USDT contract on Ethereum. The buyer funds that contract into escrow.")}</p>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={form.tokenSymbol === "USDC"}
                        className={`settlement-card${form.tokenSymbol === "USDC" ? " is-selected" : ""}`}
                        onClick={() => setForm({ ...form, chain: "ethereum", tokenSymbol: "USDC" })}
                      >
                        <span className="eyebrow">{t("Ethereum contract")}</span>
                        <h3>USDC</h3>
                        <p>{t("Direct USDC contract on Ethereum. The buyer funds that contract into escrow.")}</p>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <label>
                {t("Payment amount")}
                <div className="amount-field">
                  <span><TranslatedText text={form.tokenSymbol === "USDC" ? "USDC" : "USDT"} /></span>
                  <input required inputMode="decimal" min="0.000001" step="0.000001" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                </div>
              </label>
              <button type="submit">{t("Continue to review")}</button>
            </>
          ) : (
            <>
              <div className="review-panel">
                <p className="eyebrow">{t("Deal summary")}</p>
                <h2>{form.title}</h2>
                <ContractTerms text={form.description} empty={t("No extra terms added.")} />
                <dl className="kv">
                  <dt><TranslatedText text={"Amount"} /></dt><dd><TranslatedText text={form.tokenSymbol === "USDC" ? "USDC" : "USDT"} /> {form.amount || "0"}</dd>
                  {form.chain === "tron" && (
                    <>
                      <dt>{t("Wallet approval")}</dt>
                      <dd>
                        {t("USDT")}{" "}
                        {formatAmount((parseUnits(form.amount || "0", 6) + 1_000_000n).toString())}{" "}
                        ({form.amount || "0"} {t("trade")} + 1 {t("creation fee")})
                      </dd>
                    </>
                  )}
                  <dt><TranslatedText text={"Network"} /></dt><dd><TranslatedText text={form.chain === "tron" ? "Tron · TRC-20 USDT" : form.tokenSymbol === "USDC" ? "Ethereum · USDC" : "Ethereum · USDT"} /></dd>
                  <dt>{t("Seller")}</dt><dd>{t("Joins with a code after you create the trade")}</dd>
                  <dt>{t("Delivery window")}</dt>
                  <dd>{formatTradeWindowHours(form.deliveryWindowHours, t)}</dd>
                  <dt>{t("Buyer protection period")}</dt>
                  <dd>{formatTradeWindowHours(form.reviewWindowHours, t)}</dd>
                </dl>
              </div>
              <TradeWindowPicker
                label={t("Delivery window")}
                hint={t("Time for the seller to deliver after the escrow is funded. This is a reminder only — funds are not moved automatically.")}
                valueHours={form.deliveryWindowHours}
                onChange={(deliveryWindowHours) => setForm({ ...form, deliveryWindowHours })}
                presets={deliveryPresets}
              />
              <TradeWindowPicker
                label={t("Buyer protection period")}
                hint={t("Time the buyer has to review fulfilment, release funds, or open a dispute after delivery proof. Reminder only — no automatic release or refund.")}
                valueHours={form.reviewWindowHours}
                onChange={(reviewWindowHours) => setForm({ ...form, reviewWindowHours })}
                presets={protectionPresets}
              />
              <p className="hint"><TranslatedText text={"When the seller joins, both accounts share the same deal room. The buyer funds after both wallets are linked. Deadlines prompt the parties to act; they do not move funds automatically."} /></p>
              <div className="wallet-review-status">
                <strong><TranslatedText text={form.chain === "ethereum" ? "Buyer wallet · Ethereum" : "Buyer wallet · Tron (TRC-20)"} /></strong>
                {form.chain === "ethereum" ? (
                  evmOnEthereum ? (
                    <p className="ok-banner"><TranslatedText text={"Connected on Ethereum ·"} /> <code>{evmAddress}</code><TranslatedText text={". This address will be bound as the buyer wallet."} /></p>
                  ) : isConnected ? (
                    <EvmWrongChainBanner chainId={chainId} />
                  ) : (
                    <div><p className="hint"><TranslatedText text={"Choose MetaMask, Rabby, Coinbase Wallet, or WalletConnect."} /></p><ConnectEvmWalletButton>{t("Connect wallet")}</ConnectEvmWalletButton></div>
                  )
                ) : tron.address ? (
                  <p className="ok-banner"><TranslatedText text={tron.walletName || "TRON wallet"} /> <TranslatedText text={"connected ·"} /> <code>{tron.address}</code><TranslatedText text={". This address will be bound as the buyer wallet."} /></p>
                ) : (
                  <div><p className="hint"><TranslatedText text={"Connect a TRON wallet that supports signing transactions. You can use a wallet app or pair one with WalletConnect."} /></p><button type="button" className="secondary" onClick={() => void tron.connect()} disabled={tron.connecting}><TranslatedText text={tron.connecting ? "Opening wallet options…" : "Connect TRON wallet"} /></button></div>
                )}
              </div>
              {error && <p className="error-banner"><TranslatedText text={error} /></p>}
              <div className="action-row">
                <button type="button" className="secondary" onClick={() => { setError(null); setStep(1); }}>{t("Back to details")}</button>
                <button type="submit" disabled={busy}>{busy ? t("Creating invitation…") : t("Create trade & get code")}</button>
              </div>
            </>
          )}
          {step === 1 && error && <p className="error-banner"><TranslatedText text={error} /></p>}
        </form>

        <aside className="card-surface trade-summary-card">
          <p className="eyebrow">{t("Quick summary")}</p>
          <h2>{t("Two profiles. One escrow.")}</h2>
          <ul className="trade-flow-list">
            <li><b>01</b><span>{t("You create the deal and receive a private join code.")}</span></li>
            <li><b>02</b><span>{t("The seller joins with the code. Their account is bound to this trade.")}</span></li>
            <li><b>03</b><span>{t("Both parties share messages and fulfilment evidence, and can raise a dispute.")}</span></li>
          </ul>
          <div className="deadline-note">
            <strong>{t("Funds stay on-chain")}</strong>
            <span>{t("Join, delivery, and review windows are reminders. They do not automatically release or refund the escrow.")}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
