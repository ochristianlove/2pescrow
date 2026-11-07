import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { ResolverTier } from "./disputeResolver";

export async function notifyStaffUsers(
  userIds: string[],
  input: {
    type: string;
    title: string;
    message: string;
    disputeId?: string;
    escrowId?: string;
    payload?: Record<string, unknown>;
  },
) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await prisma.staffNotification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      disputeId: input.disputeId,
      escrowId: input.escrowId,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    })),
  });
}

export async function staffUserIdsForTier(tier: ResolverTier, disputeId?: string): Promise<string[]> {
  if (tier === "admin") {
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
    return admins.map((a) => a.id);
  }
  if (tier === "moderator") {
    const mods = await prisma.user.findMany({
      where: { role: "moderator", permissions: { has: "disputes" } },
      select: { id: true },
    });
    if (!disputeId) return mods.map((m) => m.id);
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { assignedModeratorUserId: true },
    });
    if (dispute?.assignedModeratorUserId) return [dispute.assignedModeratorUserId];
    return mods.map((m) => m.id);
  }
  const agents = await prisma.user.findMany({
    where: { role: "agent", permissions: { has: "disputes" } },
    select: { id: true },
  });
  if (!disputeId) return agents.map((a) => a.id);
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    select: { assignedAgentUserId: true },
  });
  if (dispute?.assignedAgentUserId) return [dispute.assignedAgentUserId];
  return agents.map((a) => a.id);
}
