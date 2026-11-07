import type { AuthUser, StaffPermission } from "./auth";
import { prisma } from "./db";

export const RESOLVER_TIERS = ["agent", "moderator", "admin"] as const;
export type ResolverTier = (typeof RESOLVER_TIERS)[number];

export const STAFF_DISPUTE_PERMISSIONS = ["disputes", "disputes_release"] as const;
export type StaffDisputePermission = (typeof STAFF_DISPUTE_PERMISSIONS)[number];

/** Numeric rank for escalation targets (higher = more authority). */
export function tierRank(tier: ResolverTier): number {
  if (tier === "agent") return 1;
  if (tier === "moderator") return 2;
  return 3;
}

export function staffTier(user: Pick<AuthUser, "role" | "permissions">): ResolverTier | null {
  if (user.role === "admin") return "admin";
  if (user.role === "moderator" && user.permissions.includes("disputes")) return "moderator";
  if (user.role === "agent" && user.permissions.includes("disputes")) return "agent";
  return null;
}

export function canStaffInvestigateDispute(user: AuthUser): boolean {
  return staffTier(user) !== null;
}

/** On-chain payout is always signed by the platform resolver wallet; app gates who may initiate. */
export function canStaffReleaseFunds(user: AuthUser): boolean {
  if (user.role === "admin") return true;
  if (user.role === "moderator" && user.permissions.includes("disputes")) return true;
  if (user.role === "agent" && user.permissions.includes("disputes_release")) return true;
  return false;
}

export type OpenDisputeAssignment = {
  requestedResolverTier: string;
  assignedAgentUserId: string | null;
  assignedModeratorUserId: string | null;
  ownerUserId?: string | null;
  awaitingRulingTier?: string | null;
  status?: string;
};

/** The person currently handling the case. Admin assignment still counts until a claim replaces it. */
export function disputeOwnerId(dispute: {
  ownerUserId?: string | null;
  assignedModeratorUserId?: string | null;
  assignedAgentUserId?: string | null;
}): string | null {
  return dispute.ownerUserId || dispute.assignedModeratorUserId || dispute.assignedAgentUserId || null;
}

export function staffOwnsDispute(user: AuthUser, dispute: { ownerUserId?: string | null }): boolean {
  if (user.role === "admin") return true;
  return !!dispute.ownerUserId && dispute.ownerUserId === user.id;
}

export function canClaimDispute(
  user: AuthUser,
  dispute: { status: string; ownerUserId?: string | null; awaitingRulingTier?: string | null },
): boolean {
  if (dispute.status !== "open" || dispute.ownerUserId) return false;
  const tier = staffTier(user);
  if (!tier) return false;
  if (!dispute.awaitingRulingTier) return true;
  if (tier === "admin") return true;
  return tier === dispute.awaitingRulingTier;
}

export function isAssignedToOpenDispute(user: AuthUser, dispute: OpenDisputeAssignment): boolean {
  if (user.role === "admin") return true;
  return disputeOwnerId(dispute) === user.id;
}

export async function findOpenDisputeForEscrow(escrowId: string) {
  return prisma.dispute.findFirst({
    where: { escrowId, status: "open" },
    select: {
      id: true,
      escrowId: true,
      status: true,
      requestedResolverTier: true,
      assignedAgentUserId: true,
      assignedModeratorUserId: true,
      ownerUserId: true,
      awaitingRulingTier: true,
    },
  });
}

const ACTIVE_DISPUTE_STATUSES = ["open", "ruled_pending_appeal", "appealed", "appeal_decided", "final_ruling"] as const;

/** Shared queue: any dispute staff member can read a live case. Actions still require ownership. */
export async function canStaffAccessDisputeEscrow(user: AuthUser, escrowId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  if (!canStaffInvestigateDispute(user)) return false;
  const dispute = await prisma.dispute.findFirst({
    where: { escrowId, status: { in: [...ACTIVE_DISPUTE_STATUSES] } },
    select: { id: true },
  });
  return !!dispute;
}

export async function canStaffExecuteDisputeResolution(
  user: AuthUser,
  dispute: OpenDisputeAssignment & { status: string },
): Promise<boolean> {
  if (dispute.status !== "open") return false;
  if (!canStaffReleaseFunds(user)) return false;
  if (user.role === "admin") return true;
  if (user.role === "agent") return false;
  return user.role === "moderator" && dispute.ownerUserId === user.id;
}

export function escalationTargetTier(from: ResolverTier): ResolverTier {
  if (from === "agent") return "moderator";
  return "admin";
}

export async function buildDisputeChatSummary(escrowId: string, maxMessages = 12): Promise<string> {
  const messages = await prisma.chatMessage.findMany({
    where: { escrowId },
    orderBy: { createdAt: "desc" },
    take: maxMessages,
    select: { kind: true, body: true, createdAt: true },
  });
  if (messages.length === 0) return "No trade chat messages yet.";
  return messages
    .reverse()
    .map((m) => {
      const stamp = m.createdAt.toISOString().slice(0, 16).replace("T", " ");
      const body = m.body.length > 160 ? `${m.body.slice(0, 157)}…` : m.body;
      return `[${stamp}] ${m.kind}: ${body}`;
    })
    .join("\n");
}

export function normalizeRequestedTier(value: string | undefined, fallback: ResolverTier = "moderator"): ResolverTier {
  const v = (value || fallback).toLowerCase();
  if (v === "agent" || v === "moderator" || v === "admin") return v;
  return fallback;
}

