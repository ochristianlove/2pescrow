import assert from "node:assert/strict";
import path from "path";
import test from "node:test";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const PAYOUT = "0x1111111111111111111111111111111111111111";

test("agent commission service credits, holds, and pays out", async () => {
  const { prisma } = await import("./db");
  const {
    AgentCommissionError,
    adminUpdateAgentCommission,
    agentCommissionSummary,
    creditAgentForFinalizedDispute,
    enrollAgentCommission,
    requestAgentPayout,
    setAgentPayoutStatus,
  } = await import("./agentCommission");
  const { commissionBpsForUserId } = await import("./commissions");

  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const escrowIds: string[] = [];
  const user = await prisma.user.create({
    data: {
      email: `agent-commission-${stamp}@example.test`,
      displayName: "Case Agent",
      role: "agent",
      permissions: ["disputes"],
    },
  });
  await prisma.agent.create({
    data: { userId: user.id, displayName: "Case Agent", walletAddress: null, active: true },
  });

  async function makeCase(opts: { amountAtomic: string; party?: boolean; resolved?: boolean }) {
    const escrow = await prisma.escrow.create({
      data: {
        chain: "ethereum",
        chainId: 1,
        tokenAddress: "0x0000000000000000000000000000000000000000",
        tokenSymbol: "USDT",
        amountAtomic: opts.amountAtomic,
        title: `Commission test ${stamp}`,
        buyerUserId: opts.party ? user.id : null,
        buyerAddress: opts.party ? PAYOUT : "0x2222222222222222222222222222222222222222",
        sellerAddress: "0x3333333333333333333333333333333333333333",
        status: "Disputed",
      },
    });
    escrowIds.push(escrow.id);
    const dispute = await prisma.dispute.create({
      data: {
        escrowId: escrow.id,
        openedBy: "buyer",
        status: opts.resolved === false ? "open" : "resolved",
        assignedAgentUserId: user.id,
      },
    });
    return { escrow, dispute };
  }

  try {
    const before = await agentCommissionSummary(user.id);
    assert.equal(before.enrolled, false);
    assert.equal(await commissionBpsForUserId(user.id), 200);

    const early = await makeCase({ amountAtomic: "1000000" });
    const skipped = await creditAgentForFinalizedDispute(user.id, early.escrow.id, early.dispute.id);
    assert.equal(skipped && "record" in skipped && skipped.record, false);

    const enrolled = await enrollAgentCommission({
      userId: user.id,
      displayName: "Partner Name",
      payoutAddress: PAYOUT,
      payoutChain: "ethereum",
    });
    assert.equal(enrolled.enrolled, true);
    assert.equal(enrolled.usesDefaultRate, true);
    assert.equal(enrolled.commissionBps, 50);
    assert.equal(enrolled.coolingOffActive, true);
    await assert.rejects(
      () => enrollAgentCommission({
        userId: user.id,
        displayName: "Again",
        payoutAddress: PAYOUT,
        payoutChain: "ethereum",
      }),
      (error: unknown) => error instanceof AgentCommissionError && error.statusCode === 409,
    );

    const cooling = await makeCase({ amountAtomic: "1000000" });
    const coolingCredit = await creditAgentForFinalizedDispute(user.id, cooling.escrow.id, cooling.dispute.id);
    assert.equal(coolingCredit && "status" in coolingCredit && coolingCredit.status, "cooling_off");

    const party = await makeCase({ amountAtomic: "40000000000", party: true });
    const partyCredit = await creditAgentForFinalizedDispute(user.id, party.escrow.id, party.dispute.id);
    assert.equal(partyCredit && "record" in partyCredit && partyCredit.record, false);

    await assert.rejects(() => requestAgentPayout(user.id), AgentCommissionError);

    await adminUpdateAgentCommission({ userId: user.id, commissionBps: 100, waiveCoolingOff: true });
    const afterRate = await agentCommissionSummary(user.id);
    assert.equal(afterRate.coolingOffActive, false);
    assert.equal(afterRate.commissionBps, 100);

    const paidCase = await makeCase({ amountAtomic: "40000000000" });
    const paidCredit = await creditAgentForFinalizedDispute(user.id, paidCase.escrow.id, paidCase.dispute.id);
    assert.equal(paidCredit && "status" in paidCredit && paidCredit.status, "pending");
    if (paidCredit && paidCredit.record) assert.equal(paidCredit.bps, 100);

    const coolingRow = await prisma.agentCaseCommission.findUnique({ where: { escrowId: cooling.escrow.id } });
    assert.equal(coolingRow?.status, "cooling_off");
    assert.equal(coolingRow?.commissionBps, 50);

    await assert.rejects(() => requestAgentPayout(user.id), /5 finalized/);

    for (let i = 0; i < 2; i++) await makeCase({ amountAtomic: "1000000" });
    const requested = await requestAgentPayout(user.id);
    assert.equal(requested.payoutRequests[0]?.status, "pending");
    assert.ok(BigInt(requested.payableAtomic) >= 20_000_000n);
    await assert.rejects(() => requestAgentPayout(user.id), /awaiting review/);

    const requestId = requested.payoutRequests[0].id;
    await setAgentPayoutStatus({ requestId, status: "sent" });
    const settled = await agentCommissionSummary(user.id);
    assert.equal(settled.payableAtomic, "0");
    const paidRow = await prisma.agentCaseCommission.findUnique({ where: { escrowId: paidCase.escrow.id } });
    assert.equal(paidRow?.status, "paid");
    const stillHeld = await prisma.agentCaseCommission.findUnique({ where: { escrowId: cooling.escrow.id } });
    assert.equal(stillHeld?.status, "cooling_off");
  } finally {
    await prisma.dispute.deleteMany({ where: { escrowId: { in: escrowIds } } });
    await prisma.escrow.deleteMany({ where: { id: { in: escrowIds } } });
    await prisma.agent.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
