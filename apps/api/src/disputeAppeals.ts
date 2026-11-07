import { prisma } from "./db";
import type { AuthUser } from "./auth";
import { buildDisputeChatSummary } from "./disputeResolver";

export const DISPUTE_APPEAL_WINDOW_DAYS = 3;
export const DISPUTE_APPEAL_WINDOW_MS = DISPUTE_APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function appealDeadlineFrom(now = new Date()) {
  return new Date(now.getTime() + DISPUTE_APPEAL_WINDOW_MS);
}

export function losingPartyRole(buyerFavor: boolean): "buyer" | "seller" {
  return buyerFavor ? "seller" : "buyer";
}

export function isAppealWindowOpen(dispute: { appealDeadlineAt: Date | null; status: string }) {
  if (dispute.status !== "ruled_pending_appeal") return false;
  if (!dispute.appealDeadlineAt) return false;
  return dispute.appealDeadlineAt.getTime() > Date.now();
}

export function canExecuteOnChainPayout(dispute: {
  status: string;
  appealDeadlineAt: Date | null;
  buyerFavor: boolean | null;
  appeal?: { status: string } | null;
}) {
  if (dispute.buyerFavor === null) return false;
  if (dispute.status === "appealed") return false;
  if (dispute.status === "ruled_pending_appeal") {
    if (isAppealWindowOpen(dispute)) return false;
    return true;
  }
  if (dispute.status === "appeal_decided") return true;
  if (dispute.status === "final_ruling") return true;
  return dispute.status === "resolved" ? false : false;
}

export async function partyRoleOnEscrow(userId: string, escrow: { buyerUserId?: string | null; sellerUserId?: string | null }) {
  if (escrow.buyerUserId === userId) return "buyer" as const;
  if (escrow.sellerUserId === userId) return "seller" as const;
  return null;
}

export async function buildDisputeAppealBundle(disputeId: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      appeal: true,
      evidence: true,
      escalations: { orderBy: { createdAt: "desc" } },
      assignedAgent: { select: { id: true, email: true, displayName: true } },
      assignedModerator: { select: { id: true, email: true, displayName: true } },
      escrow: {
        include: {
          messages: { orderBy: { createdAt: "asc" }, take: 200 },
          buyerUser: { select: { displayName: true, email: true } },
          sellerUser: { select: { displayName: true, email: true } },
        },
      },
    },
  });
  if (!dispute) return null;
  const ruledBy = dispute.ruledByUserId
    ? await prisma.user.findUnique({
        where: { id: dispute.ruledByUserId },
        select: { id: true, email: true, displayName: true, role: true },
      })
    : null;
  return {
    dispute: {
      id: dispute.id,
      status: dispute.status,
      buyerFavor: dispute.buyerFavor,
      rulingNote: dispute.rulingNote,
      ruledAt: dispute.ruledAt,
      appealDeadlineAt: dispute.appealDeadlineAt,
      ruledBy,
      assignedAgent: dispute.assignedAgent,
      assignedModerator: dispute.assignedModerator,
    },
    appeal: dispute.appeal,
    evidence: dispute.evidence,
    escalations: dispute.escalations,
    chatSummary: await buildDisputeChatSummary(dispute.escrowId),
    messages: dispute.escrow.messages,
    escrow: {
      id: dispute.escrow.id,
      title: dispute.escrow.title,
      status: dispute.escrow.status,
      contractAddress: dispute.escrow.contractAddress,
    },
  };
}

export function canDecideAppeal(staff: AuthUser, dispute: { ruledByUserId: string | null }) {
  if (staff.role === "admin") return true;
  if (staff.role === "moderator" && staff.permissions.includes("disputes")) {
    if (dispute.ruledByUserId && dispute.ruledByUserId === staff.id) return false;
    return true;
  }
  if (staff.role === "agent") return false;
  return false;
}
