import { fundingStepLabel, type FundingSnapshot } from "@2pescrow/shared";
import { formatEther } from "viem";
import { formatAmount } from "../lib/api";
import { useLanguage } from "../lib/language";
import "./EthereumFundingProgress.css";

export function EthereumFundingProgress({ state, error, busy, walletReady, onContinue, onRefresh }: {
  state: FundingSnapshot | null; error: string | null; busy: boolean; walletReady: boolean;
  onContinue: () => void; onRefresh: () => void;
}) {
  const { t } = useLanguage();
  return <section className="ethereum-funding-progress" aria-label={t("Payment progress")}>
    <h3>{t("Payment progress")}</h3>
    <p role="status" aria-live="polite">{t(state?.message || "Checking saved payment progress…")}</p>
    {error && <p className="error" role="alert">{t(error)}</p>}
    {state && <>
      <ul>
        <li>{t(state.contractAddress ? "Escrow created — saved to this trade" : "Escrow creation pending")}</li>
        <li>{t(state.approvalConfirmed ? "Token approval confirmed — permission to spend" : "Token approval checked before deposit")}</li>
        <li>{t(state.stage === "funded" ? "Deposit confirmed — trade funds are in escrow" : state.stage === "closed" ? "Trade closed — no further deposit" : "Deposit not yet confirmed")}</li>
      </ul>
      <p>{t("Trade deposit")}: {formatAmount(state.amountAtomic)} {state.tokenSymbol}. {t("Creation fee")}: {formatAmount(state.feeAtomic)} {state.tokenSymbol}.</p>
      <p>{t("Approval grants permission; it is not payment. A wallet showing 0 ETH can still approve or transfer tokens. Network fees are separate.")}</p>
      {state.attempts.length > 0 && <details>
        <summary>{t("Transactions and network fees")}</summary>
        <ul>{state.attempts.map(a => <li key={a.id}>
          {t(fundingStepLabel(a.kind))}: {t(a.status)}
          {a.gasPaidWei && <> — {formatEther(BigInt(a.gasPaidWei))} ETH {t("network fee")}</>}
          {a.hash && <> <a href={`https://etherscan.io/tx/${a.hash}`} target="_blank" rel="noreferrer">{t("View transaction")}</a></>}
        </li>)}</ul>
        <p>{t("Wallet gas-payment services may show additional token charges. Their charges are separate from this trade deposit.")}</p>
      </details>}
    </>}
    <div className="action-row">
      {state && !["funded", "closed"].includes(state.stage) && <button type="button" disabled={busy || !walletReady || !state.canContinue} onClick={onContinue}>
        {t(busy ? "Waiting for wallet or confirmation…" : state.active ? "Continue saved wallet request" : state.contractAddress ? "Resume funding existing escrow" : "Start funding")}
      </button>}
      <button type="button" className="secondary" disabled={busy} onClick={onRefresh}>{t("Check payment status")}</button>
    </div>
    {!walletReady && state?.stage !== "funded" && <p>{t("Connect the buyer wallet linked to this trade on Ethereum to continue.")}</p>}
  </section>;
}
