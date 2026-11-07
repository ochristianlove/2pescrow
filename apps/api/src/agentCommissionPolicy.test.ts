import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_COMMISSION_BPS, REFERRER_COMMISSION_BPS, commissionAtomicFromProfit } from "./commissions";
import {
  AGENT_MAX_COMMISSION_BPS,
  AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT,
  AGENT_PAYOUT_MIN_ATOMIC,
  agentPayoutBlockReason,
  coolingOffEndsAt,
  decideAgentCaseCredit,
  resolveAgentCommissionBps,
  stackedEarnings,
} from "./agentCommissionPolicy";

const profit = (100_000_000n * 10n) / 100n + 1_000_000n;

test("empty override uses 50 bps and the cap is 5 percent", () => {
  assert.equal(resolveAgentCommissionBps(null), AGENT_COMMISSION_BPS);
  assert.equal(resolveAgentCommissionBps(undefined), 50);
  assert.equal(resolveAgentCommissionBps(500), AGENT_MAX_COMMISSION_BPS);
  assert.throws(() => resolveAgentCommissionBps(501));
  assert.throws(() => resolveAgentCommissionBps(-1));
  assert.throws(() => resolveAgentCommissionBps(1.5));
});

test("no profile, incomplete wallet, party, and inactive earn nothing", () => {
  const base = {
    hasProfile: true,
    payoutReady: true,
    active: true,
    isParty: false,
    alreadyRecorded: false,
    finalizedAt: new Date("2026-08-01T00:00:00Z"),
    coolingOffEndsAt: new Date("2026-01-01T00:00:00Z"),
    commissionBpsOverride: null,
    platformProfitAtomic: profit,
  };
  assert.equal(decideAgentCaseCredit({ ...base, hasProfile: false }).record, false);
  assert.equal(decideAgentCaseCredit({ ...base, payoutReady: false }).record, false);
  assert.equal(decideAgentCaseCredit({ ...base, isParty: true }).record, false);
  assert.equal(decideAgentCaseCredit({ ...base, active: false }).record, false);
});

test("cases finalized during the 7-day cooling-off are recorded but not payable", () => {
  const optedIn = new Date("2026-08-01T00:00:00Z");
  const ends = coolingOffEndsAt(optedIn);
  assert.equal(ends.getTime() - optedIn.getTime(), 7 * 24 * 60 * 60 * 1000);
  const during = decideAgentCaseCredit({
    hasProfile: true,
    payoutReady: true,
    active: true,
    isParty: false,
    alreadyRecorded: false,
    finalizedAt: new Date("2026-08-03T00:00:00Z"),
    coolingOffEndsAt: ends,
    commissionBpsOverride: null,
    platformProfitAtomic: profit,
  });
  assert.equal(during.record && during.status, "cooling_off");
  const after = decideAgentCaseCredit({
    hasProfile: true,
    payoutReady: true,
    active: true,
    isParty: false,
    alreadyRecorded: false,
    finalizedAt: ends,
    coolingOffEndsAt: ends,
    commissionBpsOverride: 100,
    platformProfitAtomic: profit,
  });
  assert.equal(after.record && after.status, "pending");
  if (after.record) assert.equal(after.bps, 100);
});

test("cash-out needs 5 finalized cases and 20 dollars", () => {
  const payable = AGENT_PAYOUT_MIN_ATOMIC;
  assert.match(
    agentPayoutBlockReason({
      finalizedCaseCount: 4,
      payableAtomic: payable,
      requestedAtomic: payable,
      hasPendingRequest: false,
    }) || "",
    /5 finalized/,
  );
  assert.match(
    agentPayoutBlockReason({
      finalizedCaseCount: AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT,
      payableAtomic: payable - 1n,
      requestedAtomic: payable - 1n,
      hasPendingRequest: false,
    }) || "",
    /\$20/,
  );
  assert.equal(
    agentPayoutBlockReason({
      finalizedCaseCount: 5,
      payableAtomic: payable,
      requestedAtomic: payable,
      hasPendingRequest: false,
    }),
    null,
  );
});

test("referral commission stacks beside agent commission", () => {
  const agent = decideAgentCaseCredit({
    hasProfile: true,
    payoutReady: true,
    active: true,
    isParty: false,
    alreadyRecorded: false,
    finalizedAt: new Date("2026-09-01T00:00:00Z"),
    coolingOffEndsAt: new Date("2026-01-01T00:00:00Z"),
    commissionBpsOverride: null,
    platformProfitAtomic: profit,
  });
  const stacked = stackedEarnings({ hasReferrer: true, platformProfitAtomic: profit, agent });
  assert.equal(stacked.referralAtomic, commissionAtomicFromProfit(profit, REFERRER_COMMISSION_BPS));
  assert.equal(stacked.agentAtomic, commissionAtomicFromProfit(profit, AGENT_COMMISSION_BPS));
  assert.equal(stacked.agentPayable, true);
  assert.notEqual(stacked.referralAtomic, stacked.agentAtomic);
});
