import { AGENT_COMMISSION_BPS, REFERRER_COMMISSION_BPS, commissionAtomicFromProfit } from "./commissions";

/** 5% of platform profit. Exclusive offers cannot exceed this. */
export const AGENT_MAX_COMMISSION_BPS = 500;

/** Finalized cases required before an agent can cash out. */
export const AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT = 5;

export const AGENT_COOLING_OFF_MS = 7 * 24 * 60 * 60 * 1000;

/** Same $20 floor as referral payouts (6-decimal stablecoins). */
export const AGENT_PAYOUT_MIN_ATOMIC = 20_000_000n;

export function coolingOffEndsAt(optedInAt: Date, now = optedInAt): Date {
  return new Date(now.getTime() + AGENT_COOLING_OFF_MS);
}

/** Null or omitted override uses the platform default of 50 bps. */
export function resolveAgentCommissionBps(override: number | null | undefined): number {
  if (override == null) return AGENT_COMMISSION_BPS;
  if (!Number.isInteger(override) || override < 0 || override > AGENT_MAX_COMMISSION_BPS) {
    throw new Error(`Agent commission must be a whole number from 0 to ${AGENT_MAX_COMMISSION_BPS} basis points (5% of platform profit).`);
  }
  return override;
}

export type AgentCreditDecision =
  | { record: false; reason: "no_profile" | "incomplete_payout" | "party" | "inactive" | "already_recorded" | "zero" }
  | { record: true; status: "cooling_off" | "pending"; bps: number; commissionAtomic: bigint };

export function decideAgentCaseCredit(input: {
  hasProfile: boolean;
  payoutReady: boolean;
  active: boolean;
  isParty: boolean;
  alreadyRecorded: boolean;
  finalizedAt: Date;
  coolingOffEndsAt: Date;
  commissionBpsOverride: number | null | undefined;
  platformProfitAtomic: bigint;
}): AgentCreditDecision {
  if (!input.hasProfile) return { record: false, reason: "no_profile" };
  if (!input.active) return { record: false, reason: "inactive" };
  if (!input.payoutReady) return { record: false, reason: "incomplete_payout" };
  if (input.isParty) return { record: false, reason: "party" };
  if (input.alreadyRecorded) return { record: false, reason: "already_recorded" };
  const bps = resolveAgentCommissionBps(input.commissionBpsOverride);
  const commissionAtomic = commissionAtomicFromProfit(input.platformProfitAtomic, bps);
  if (commissionAtomic <= 0n) return { record: false, reason: "zero" };
  const status = input.finalizedAt.getTime() < input.coolingOffEndsAt.getTime() ? "cooling_off" : "pending";
  return { record: true, status, bps, commissionAtomic };
}

export function agentPayoutBlockReason(input: {
  finalizedCaseCount: number;
  payableAtomic: bigint;
  requestedAtomic: bigint;
  hasPendingRequest: boolean;
}): string | null {
  if (input.finalizedCaseCount < AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT) {
    return `Cash-out opens after ${AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT} finalized cases. You have ${input.finalizedCaseCount}.`;
  }
  if (input.hasPendingRequest) return "You already have a payout request awaiting review.";
  if (input.requestedAtomic <= 0n) return "No payable commission yet.";
  if (input.requestedAtomic < AGENT_PAYOUT_MIN_ATOMIC) return "Minimum payout is $20.00.";
  if (input.requestedAtomic !== input.payableAtomic) return "Request the full payable balance.";
  return null;
}

/** Referral commission stays on its own rate even when the same person is an agent. */
export function stackedEarnings(input: {
  hasReferrer: boolean;
  platformProfitAtomic: bigint;
  agent: AgentCreditDecision;
}): { referralAtomic: bigint; agentAtomic: bigint; agentPayable: boolean } {
  const referralAtomic = input.hasReferrer
    ? commissionAtomicFromProfit(input.platformProfitAtomic, REFERRER_COMMISSION_BPS)
    : 0n;
  const agentPayable = input.agent.record && input.agent.status === "pending";
  const agentAtomic = input.agent.record ? input.agent.commissionAtomic : 0n;
  return { referralAtomic, agentAtomic, agentPayable };
}
