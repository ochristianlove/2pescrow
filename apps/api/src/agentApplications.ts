import { prisma } from "./db";
import { assertAgentVolumeQualified, agentEligibilityForUser } from "./agentEligibility";

export type AgentApplicationStatus = "pending" | "approved" | "rejected";

export async function latestAgentApplicationForUser(userId: string) {
  return prisma.agentApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function agentApplicationContextForUser(userId: string) {
  const [eligibility, user, application] = await Promise.all([
    agentEligibilityForUser(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    latestAgentApplicationForUser(userId),
  ]);
  const isAgent = user?.role === "agent" || user?.role === "admin";
  const canApply =
    !isAgent &&
    eligibility.qualified &&
    (!application || application.status !== "pending") &&
    (!application || application.status === "rejected");
  return {
    eligibility,
    application,
    isAgent,
    canApply,
  };
}

export async function submitAgentApplication(userId: string, applicantNote?: string) {
  const ctx = await agentApplicationContextForUser(userId);
  if (ctx.isAgent) {
    throw new AgentApplicationError(409, "You are already an agent or admin");
  }
  if (!ctx.eligibility.qualified) {
    throw new AgentApplicationError(400, "Complete about $30,000 in trade volume before applying", {
      agentEligibility: ctx.eligibility,
    });
  }
  if (ctx.application?.status === "pending") {
    throw new AgentApplicationError(409, "You already have a pending application");
  }
  await assertAgentVolumeQualified(userId);
  return prisma.agentApplication.create({
    data: {
      userId,
      status: "pending",
      applicantNote: applicantNote?.trim() || null,
      volumeAtomicAtApply: ctx.eligibility.volumeAtomic,
    },
  });
}

export async function grantAgentStaffAccess(userId: string) {
  await assertAgentVolumeQualified(userId);
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AgentApplicationError(404, "User not found");
  if (target.role === "admin") throw new AgentApplicationError(403, "Cannot change super admin");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: "agent", permissions: ["disputes"] },
  });
  await prisma.agent.upsert({
    where: { userId: updated.id },
    create: {
      userId: updated.id,
      displayName: updated.displayName || updated.email || "Agent",
      walletAddress: null,
    },
    update: { active: true, displayName: updated.displayName || updated.email || "Agent" },
  });
  return updated;
}

export async function listAgentApplications(status?: AgentApplicationStatus) {
  return prisma.agentApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, email: true, displayName: true, role: true, createdAt: true } },
      reviewedBy: { select: { id: true, email: true, displayName: true } },
    },
  });
}

export async function decideAgentApplication(
  applicationId: string,
  adminUserId: string,
  approve: boolean,
  reviewNote?: string,
) {
  const application = await prisma.agentApplication.findUnique({
    where: { id: applicationId },
    include: { user: true },
  });
  if (!application) throw new AgentApplicationError(404, "Application not found");
  if (application.status !== "pending") {
    throw new AgentApplicationError(409, "Application was already decided");
  }
  if (approve) {
    await grantAgentStaffAccess(application.userId);
  }
  return prisma.agentApplication.update({
    where: { id: applicationId },
    data: {
      status: approve ? "approved" : "rejected",
      reviewedByUserId: adminUserId,
      reviewNote: reviewNote?.trim() || null,
      decidedAt: new Date(),
    },
    include: {
      user: { select: { id: true, email: true, displayName: true, role: true } },
    },
  });
}

export class AgentApplicationError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentApplicationError";
  }
}
