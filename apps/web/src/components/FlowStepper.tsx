import { useLanguage } from "../lib/language";

const STEPS = [
  { key: "AwaitingSeller", label: "Seller joins" },
  { key: "BuyerFunding", label: "Buyer funds escrow" },
  { key: "InProgress", label: "Proof / delivery" },
  { key: "Completed", label: "Released" },
] as const;

/** Which step index is active for a trade status (funding is one step; green when Funded+). */
const STATUS_ACTIVE_STEP: Record<string, number> = {
  AwaitingSeller: 0,
  AwaitingFunding: 1,
  Created: 1,
  Funded: 2,
  InProgress: 2,
  Completed: 3,
  Resolved: 3,
};

function stepperActiveIndex(status: string): number {
  if (status === "Disputed" || status === "Cancelled") return -1;
  return STATUS_ACTIVE_STEP[status] ?? 1;
}

export function FlowStepper({ status }: { status: string }) {
  const { t } = useLanguage();
  const dispute = status === "Disputed" || status === "Resolved";
  const cancelled = status === "Cancelled";
  const activeIdx = stepperActiveIndex(status);

  return (
    <div className="stepper">
      {STEPS.map((step, i) => {
        const done = activeIdx > i || status === "Completed" || status === "Resolved";
        const current = activeIdx === i;
        return (
          <div key={step.key} className={`step ${done ? "done" : ""} ${current ? "current" : ""}`}>
            <div className="step-dot">{done ? "✓" : i + 1}</div>
            <div className="step-label">{t(step.label)}</div>
          </div>
        );
      })}
      {dispute && <p className="step-note danger-text">{t("Dispute path active")} — {t(status)}</p>}
      {cancelled && (
        <p className="step-note muted">
          {t("Trade cancelled — buyer refunded (trade amount minus $1 cancel commission when the seller closed the trade).")}
        </p>
      )}
    </div>
  );
}
