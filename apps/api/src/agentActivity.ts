import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { AuthUser } from "./auth";

export type AgentActivityInput = {
  agentUserId: string;
  action: string;
  summary: string;
  disputeId?: string;
  escrowId?: string;
  payload?: Record<string, unknown>;
};

export async function logAgentActivity(input: AgentActivityInput) {
  return prisma.agentActivity.create({
    data: {
      agentUserId: input.agentUserId,
      action: input.action,
      summary: input.summary.slice(0, 4000),
      disputeId: input.disputeId,
      escrowId: input.escrowId,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function logAgentActivityIfAgent(
  user: Pick<AuthUser, "id" | "role">,
  input: Omit<AgentActivityInput, "agentUserId">,
) {
  if (user.role !== "agent") return null;
  return logAgentActivity({ ...input, agentUserId: user.id });
}

export async function listAgentActivity(opts: { agentUserId?: string; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return prisma.agentActivity.findMany({
    where: opts.agentUserId ? { agentUserId: opts.agentUserId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { id: true, email: true, displayName: true } },
    },
  });
}
