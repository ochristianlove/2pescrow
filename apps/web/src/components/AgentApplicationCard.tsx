import { useState } from "react";
import { api } from "../lib/api";
import { useLanguage } from "../lib/language";

export type AgentEligibility = {
  qualified: boolean;
  volumeAtomic: string;
  volumeUsdApprox: string;
  requiredVolumeAtomic: string;
  requiredVolumeUsdApprox: string;
  referenceTradeUsd: number;
  multiplier: number;
  qualifyingStatuses: string[];
  measurementNote: string;
};

export type AgentApplicationContext = {
  eligibility: AgentEligibility;
  application: {
    id: string;
    status: string;
    applicantNote?: string | null;
    reviewNote?: string | null;
    createdAt: string;
    decidedAt?: string | null;
  } | null;
  isAgent: boolean;
  canApply: boolean;
};

function volumeProgressPercent(eligibility: AgentEligibility): number {
  const vol = BigInt(eligibility.volumeAtomic || "0");
  const req = BigInt(eligibility.requiredVolumeAtomic || "1");
  if (vol >= req) return 100;
  const scaled = Number((vol * 10000n) / req) / 100;
  return Math.min(100, Math.max(0, scaled));
}

type Props = {
  context: AgentApplicationContext | null;
  loading: boolean;
  headers: () => Record<string, string>;
  onUpdated: () => void | Promise<void>;
  userRole?: string;
  /** When true, omit outer card chrome — parent section supplies the title. */
  embedded?: boolean;
};

export function AgentApplicationCard({ context, loading, headers, onUpdated, userRole, embedded }: Props) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [localOk, setLocalOk] = useState<string | null>(null);

  const Shell = embedded ? "div" : "section";

  if (loading && !context) {
    return (
      <Shell className={embedded ? "agent-apply-inner" : "card-surface agent-apply-card"} aria-busy="true">
        <p className="muted">{t("Loading agent qualification…")}</p>
      </Shell>
    );
  }
  if (!context) return null;

  const { eligibility, application, isAgent, canApply } = context;
  const progress = volumeProgressPercent(eligibility);
  const qualified = eligibility.qualified;

  if (userRole === "admin") return null;
  if (isAgent) {
    return (
      <Shell className={embedded ? "agent-apply-inner agent-apply-card--agent" : "card-surface agent-apply-card agent-apply-card--agent"}>
        {!embedded && <p className="eyebrow">{t("Dispute agent")}</p>}
        <h3 className="agent-apply-subhead">{t("You’re an approved agent")}</h3>
        <p className="muted">{t("Assigned disputes appear in your staff tools. You can still use referral links separately.")}</p>
      </Shell>
    );
  }

  async function submitApplication() {
    setSubmitting(true);
    setLocalErr(null);
    setLocalOk(null);
    try {
      await api("/v1/me/agent-application", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setLocalOk(t("Application submitted. A super admin will review it soon."));
      setNote("");
      await onUpdated();
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const shellClass = embedded
    ? "agent-apply-inner"
    : `card-surface agent-apply-card${qualified ? " agent-apply-card--qualified" : ""}`;

  return (
    <Shell className={shellClass} aria-labelledby={embedded ? undefined : "agent-apply-heading"}>
      {!embedded && (
        <>
          <p className="eyebrow">{t("Become a dispute agent")}</p>
          <h2 id="agent-apply-heading">{t("Agent qualification")}</h2>
        </>
      )}
      {embedded && <h3 className="agent-apply-subhead">{t("Your qualification status")}</h3>}
      <p className="muted">
        {t("Complete about $30,000 in completed or resolved trades (3× $10,000 reference trades) to apply. Super admin approval is required.")}
      </p>

      <div className="agent-volume-progress" role="group" aria-label={t("Trade volume toward agent qualification")}>
        <div className="agent-volume-progress-labels">
          <span>
            <strong>${eligibility.volumeUsdApprox}</strong> {t("completed volume")}
          </span>
          <span className="muted">
            {t("Goal")}: ${eligibility.requiredVolumeUsdApprox}
          </span>
        </div>
        <div className="agent-volume-progress-track" aria-hidden="true">
          <div className="agent-volume-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="hint agent-volume-progress-hint">
          {qualified
            ? t("You’ve reached the volume requirement.")
            : t(`${Math.round(progress)}% toward the $30,000 requirement. Only Completed and Resolved trades count.`)}
        </p>
      </div>

      {qualified && canApply && (
        <div className="ok-banner agent-apply-cta-banner" role="status">
          <strong>{t("You qualify to apply")}</strong>
          <p>{t("Next step: submit an agent application. Approval lets you handle disputes. Case commission starts only after you opt in, at the platform default of 0.5% of the platform fee.")}</p>
        </div>
      )}

      {application?.status === "pending" && (
        <p className="ok-banner" role="status">
          {t("Your agent application is pending review.")}
          {application.createdAt ? ` ${t("Submitted")} ${new Date(application.createdAt).toLocaleString()}.` : ""}
        </p>
      )}

      {application?.status === "rejected" && (
        <p className="error-banner" role="status">
          {t("Your last application was not approved.")}
          {application.reviewNote ? ` ${application.reviewNote}` : ""}
          {canApply ? ` ${t("You may submit a new application.")}` : ""}
        </p>
      )}

      {application?.status === "approved" && !isAgent && (
        <p className="ok-banner">{t("Your application was approved. Refresh the page if your agent access hasn’t appeared yet.")}</p>
      )}

      {localOk && <p className="ok-banner">{localOk}</p>}
      {localErr && <p className="error-banner">{localErr}</p>}

      {canApply && (
        <div className="agent-apply-form">
          <label>
            {t("Optional note for reviewers")}
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Experience with disputes, time zone, languages…")}
              maxLength={2000}
            />
          </label>
          <button type="button" className="primary agent-apply-submit" disabled={submitting} onClick={() => void submitApplication()}>
            {submitting ? t("Submitting…") : t("Submit agent application")}
          </button>
        </div>
      )}

      {!qualified && (
        <p className="hint">{t("Keep trading — volume updates when escrows complete or resolve.")}</p>
      )}
    </Shell>
  );
}
