import type { Dispute } from "./types";

export function disputeRulingAllowsAppeal(dispute: Dispute | undefined | null): boolean {
  if (!dispute) return false;
  return dispute.ruledBy?.role === "agent";
}

export function disputeAppealWindowOpen(dispute: Dispute | undefined | null): boolean {
  if (!dispute || !disputeRulingAllowsAppeal(dispute)) return false;
  if (dispute.status !== "ruled_pending_appeal") return false;
  if (!dispute.appealDeadlineAt || dispute.appeal) return false;
  return new Date(dispute.appealDeadlineAt).getTime() > Date.now();
}

export function clientCanFinalizeDisputePayout(dispute: Dispute): boolean {
  if (dispute.buyerFavor == null) return false;
  if (dispute.status === "appealed") return false;
  if (dispute.status === "ruled_pending_appeal") {
    if (!disputeRulingAllowsAppeal(dispute)) return true;
    if (!dispute.appealDeadlineAt) return false;
    return new Date(dispute.appealDeadlineAt).getTime() <= Date.now();
  }
  return dispute.status === "appeal_decided";
}
