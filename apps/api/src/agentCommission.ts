import { prisma } from "./db";
import { addressesMatch, type ChainKey } from "./addresses";
import { validatePayoutAddress } from "./referralPayout";
import { platformProfitAtomic } from "./referrals";
import {
  AGENT_COOLING_OFF_MS,
  AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT,
  AGENT_PAYOUT_MIN_ATOMIC,
  agentPayoutBlockReason,
  coolingOffEndsAt,
  decideAgentCaseCredit,
  resolveAgentCommissionBps,
} from "./agentCommissionPolicy";
import { AGENT_COMMISSION_BPS, commissionRatePercent } from "./commissions";

export class AgentCommissionError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

async function finalizedCaseCount(userId: string): Promise<number> {
  return prisma.dispute.count({
    where: { assignedAgentUserId: userId, status: "resolved" },
  });
}

function payableAtomic(rows: { status: string; commissionAtomic: string }[]): bigint {
  return rows.reduce((sum, row) => (row.status === "pending" ? sum + BigInt(row.commissionAtomic) : sum), 0n);
}

export async function agentCommissionSummary(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "agent") {
    throw new AgentCommissionError(403, "Only an approved agent can use case commission");
  }
  const [profile, cases, pendingRows] = await Promise.all([
    prisma.agentCommissionProfile.findUnique({
      where: { userId },
      include: {
        commissions: { orderBy: { createdAt: "desc" }, take: 20 },
        payoutRequests: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    }),
    finalizedCaseCount(userId),
    prisma.agentCaseCommission.findMany({
      where: { profile: { userId }, status: "pending" },
      select: { status: true, commissionAtomic: true },
    }),
  ]);
  const fullPayable = payableAtomic(pendingRows);
  const bps = resolveAgentCommissionBps(profile?.commissionBps);
  return {
    enrolled: !!profile,
    payoutReady: !!profile?.payoutAddress && !!profile.payoutChain,
    displayName: profile?.displayName ?? null,
    payoutAddress: profile?.payoutAddress ?? null,
    payoutChain: profile?.payoutChain ?? null,
    commissionBps: profile ? bps : null,
    usesDefaultRate: !profile || profile.commissionBps == null,
    defaultBps: AGENT_COMMISSION_BPS,
    commissionRatePercent: commissionRatePercent(bps),
    optedInAt: profile?.optedInAt ?? null,
    coolingOffEndsAt: profile?.coolingOffEndsAt ?? null,
    coolingOffActive: profile ? profile.coolingOffEndsAt.getTime() > Date.now() : false,
    finalizedCaseCount: cases,
    minFinalizedCases: AGENT_MIN_FINALIZED_CASES_FOR_PAYOUT,
    payoutMinAtomic: AGENT_PAYOUT_MIN_ATOMIC.toString(),
    payableAtomic: fullPayable.toString(),
    recent: profile?.commissions ?? [],
    payoutRequests: profile?.payoutRequests ?? [],
  };
}

export async function enrollAgentCommission(input: {
  userId: string;
  displayName: string;
  payoutAddress: string;
  payoutChain: ChainKey;
}) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { role: true } });
  if (!user || user.role !== "agent") {
    throw new AgentCommissionError(403, "Ask an admin to approve you as an agent before opting into commission");
  }
  const existing = await prisma.agentCommissionProfile.findUnique({ where: { userId: input.userId } });
  if (existing) throw new AgentCommissionError(409, "You already opted into case commission");
  const name = input.displayName.trim();
  if (name.length < 1 || name.length > 80) throw new AgentCommissionError(400, "Enter the name you want on your commission profile");
  const payoutAddress = validatePayoutAddress(input.payoutChain, input.payoutAddress);
  const now = new Date();
  await prisma.agentCommissionProfile.create({
    data: {
      userId: input.userId,
      displayName: name,
      payoutAddress,
      payoutChain: input.payoutChain,
      commissionBps: null,
      optedInAt: now,
      coolingOffEndsAt: coolingOffEndsAt(now),
    },
  });
  return agentCommissionSummary(input.userId);
}

export async function updateAgentPayoutWallet(input: {
  userId: string;
  payoutAddress: string;
  payoutChain: ChainKey;
}) {
  const profile = await prisma.agentCommissionProfile.findUnique({ where: { userId: input.userId } });
  if (!profile) throw new AgentCommissionError(404, "Opt in before saving a payout wallet");
  const payoutAddress = validatePayoutAddress(input.payoutChain, input.payoutAddress);
  await prisma.agentCommissionProfile.update({
    where: { id: profile.id },
    data: { payoutAddress, payoutChain: input.payoutChain },
  });
  return agentCommissionSummary(input.userId);
}

export async function creditAgentForFinalizedDispute(agentUserId: string, escrowId: string, disputeId: string) {
  const [profile, escrow, wallets, agentRow, existing] = await Promise.all([
    prisma.agentCommissionProfile.findUnique({ where: { userId: agentUserId } }),
    prisma.escrow.findUnique({ where: { id: escrowId } }),
    prisma.wallet.findMany({ where: { userId: agentUserId }, select: { address: true } }),
    prisma.agent.findUnique({ where: { userId: agentUserId }, select: { active: true } }),
    prisma.agentCaseCommission.findUnique({ where: { escrowId } }),
  ]);
  if (!escrow) return null;
  const chain: ChainKey = escrow.chain === "tron" ? "tron" : "ethereum";
  const isParty =
    escrow.buyerUserId === agentUserId
    || escrow.sellerUserId === agentUserId
    || wallets.some((wallet) =>
      addressesMatch(chain, escrow.buyerAddress, wallet.address)
      || addressesMatch(chain, escrow.sellerAddress, wallet.address));
  const profit = platformProfitAtomic(escrow.amountAtomic);
  const decision = decideAgentCaseCredit({
    hasProfile: !!profile,
    payoutReady: !!profile?.payoutAddress && !!profile.payoutChain,
    active: agentRow?.active !== false,
    isParty,
    alreadyRecorded: !!existing,
    finalizedAt: new Date(),
    coolingOffEndsAt: profile?.coolingOffEndsAt ?? new Date(Date.now() + AGENT_COOLING_OFF_MS),
    commissionBpsOverride: profile?.commissionBps,
    platformProfitAtomic: profit,
  });
  if (!decision.record || !profile) return decision;
  await prisma.agentCaseCommission.create({
    data: {
      profileId: profile.id,
      escrowId,
      disputeId,
      commissionBps: decision.bps,
      platformProfitAtomic: profit.toString(),
      commissionAtomic: decision.commissionAtomic.toString(),
      status: decision.status,
      finalizedAt: new Date(),
    },
  });
  return decision;
}

export async function requestAgentPayout(userId: string) {
  const summary = await agentCommissionSummary(userId);
  if (!summary.enrolled || !summary.payoutReady) {
    throw new AgentCommissionError(409, "Save a payout wallet before requesting a payout");
  }
  const profile = await prisma.agentCommissionProfile.findUniqueOrThrow({ where: { userId } });
  const pendingRequest = await prisma.agentPayoutRequest.findFirst({
    where: { profileId: profile.id, status: "pending" },
  });
  const payable = BigInt(summary.payableAtomic);
  const reason = agentPayoutBlockReason({
    finalizedCaseCount: summary.finalizedCaseCount,
    payableAtomic: payable,
    requestedAtomic: payable,
    hasPendingRequest: !!pendingRequest,
  });
  if (reason) throw new AgentCommissionError(409, reason);
  await prisma.agentPayoutRequest.create({
    data: { profileId: profile.id, amountAtomic: payable.toString(), status: "pending" },
  });
  return agentCommissionSummary(userId);
}

export async function listAgentCommissionAdmin() {
  const [users, counts, payouts] = await Promise.all([
    prisma.user.findMany({
      where: { role: "agent" },
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        agentCommissionProfile: true,
      },
    }),
    prisma.dispute.groupBy({
      by: ["assignedAgentUserId"],
      where: { status: "resolved", assignedAgentUserId: { not: null } },
      _count: { _all: true },
    }),
    prisma.agentPayoutRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { profile: { select: { displayName: true, payoutAddress: true, payoutChain: true, userId: true } } },
    }),
  ]);
  const countByUser = new Map(counts.map((row) => [row.assignedAgentUserId, row._count._all]));
  return {
    agents: users.map((user) => ({
      userId: user.id,
      email: user.email,
      accountName: user.displayName,
      finalizedCaseCount: countByUser.get(user.id) ?? 0,
      profile: user.agentCommissionProfile
        ? {
            ...user.agentCommissionProfile,
            effectiveBps: resolveAgentCommissionBps(user.agentCommissionProfile.commissionBps),
          }
        : null,
    })),
    pendingPayouts: payouts,
  };
}

export async function adminUpdateAgentCommission(input: {
  userId: string;
  commissionBps?: number | null;
  coolingOffEndsAt?: Date | null;
  waiveCoolingOff?: boolean;
}) {
  const profile = await prisma.agentCommissionProfile.findUnique({ where: { userId: input.userId } });
  if (!profile) throw new AgentCommissionError(404, "This agent has not opted into commission");
  const data: { commissionBps?: number | null; coolingOffEndsAt?: Date } = {};
  if (input.commissionBps !== undefined) {
    data.commissionBps = input.commissionBps == null ? null : resolveAgentCommissionBps(input.commissionBps);
  }
  if (input.waiveCoolingOff) data.coolingOffEndsAt = new Date(0);
  else if (input.coolingOffEndsAt) {
    if (input.coolingOffEndsAt.getTime() > profile.coolingOffEndsAt.getTime()) {
      throw new AgentCommissionError(400, "Cooling-off can be shortened or waived. It cannot be extended.");
    }
    data.coolingOffEndsAt = input.coolingOffEndsAt;
  }
  await prisma.agentCommissionProfile.update({ where: { id: profile.id }, data });
  return prisma.agentCommissionProfile.findUnique({ where: { id: profile.id } });
}

export async function setAgentPayoutStatus(input: { requestId: string; status: "sent" | "rejected"; adminNote?: string }) {
  const request = await prisma.agentPayoutRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new AgentCommissionError(404, "Payout request not found");
  if (request.status !== "pending") throw new AgentCommissionError(409, "This payout was already reviewed");
  if (input.status === "rejected") {
    return prisma.agentPayoutRequest.update({
      where: { id: request.id },
      data: { status: "rejected", adminNote: input.adminNote ?? null, reviewedAt: new Date() },
    });
  }
  const amount = BigInt(request.amountAtomic);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.agentCaseCommission.findMany({
      where: { profileId: request.profileId, status: "pending" },
      orderBy: { createdAt: "asc" },
    });
    let allocated = 0n;
    const now = new Date();
    for (const row of rows) {
      if (allocated >= amount) break;
      const rowAmt = BigInt(row.commissionAtomic);
      if (allocated + rowAmt > amount) break;
      await tx.agentCaseCommission.update({
        where: { id: row.id },
        data: { status: "paid", paidAt: now, payoutRequestId: request.id },
      });
      allocated += rowAmt;
    }
    if (allocated !== amount) {
      throw new AgentCommissionError(409, "Payable commissions no longer match this request. Reject it and ask the agent to request again.");
    }
    await tx.agentPayoutRequest.update({
      where: { id: request.id },
      data: { status: "sent", adminNote: input.adminNote ?? null, reviewedAt: now, sentAt: now },
    });
  });
  return prisma.agentPayoutRequest.findUnique({ where: { id: request.id } });
}
