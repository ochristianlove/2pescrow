import type { FastifyInstance } from "fastify";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { z } from "zod";
import { config } from "./config";
import { prisma } from "./db";
import { requireUser, userMayMutateEscrow } from "./auth";
import { broadcast } from "./wsHub";
import { EthereumFundingService, FundingError } from "./ethereumFunding";

const client = createPublicClient({ chain: mainnet, transport: http(config.ethereumRpcUrl, { timeout: 10_000, retryCount: 0 }) });
const LEGACY_ETHEREUM_FACTORIES = ["0x08Be929Ac784E8aEe20403c4F5bbEE2668e183c9"];

export const ethereumFunding = new EthereumFundingService(prisma, client, async () => {
  const s = await prisma.platformSettings.findUnique({ where: { id: 1 } });
  const activeFactory = s?.factoryAddress || config.factoryAddress || "";
  const allowedFactories = [activeFactory, config.factoryAddress || "", ...LEGACY_ETHEREUM_FACTORIES].filter(Boolean);
  return { factory: activeFactory, allowedFactories, tokens: {
    USDT: s?.usdtAddress || config.usdtAddress, USDC: s?.usdcAddress || config.usdcAddress,
    THIRD: s?.thirdStablecoinAddress || config.thirdStablecoinAddress,
  } };
});

export function registerEthereumFundingRoutes(app: FastifyInstance) {
  for (const action of ["state", "prepare", "report", "recover"] as const) {
    app.route({
      method: action === "state" ? "GET" : "POST",
      url: `/v1/escrows/:id/ethereum-funding${action === "state" ? "" : `/${action}`}`,
      handler: async (req, reply) => {
        const auth = await requireUser(req, reply);
        if (!auth) return;
        const { id } = req.params as { id: string };
        const row = await prisma.escrow.findUnique({ where: { id } });
        if (!row) return reply.code(404).send({ error: "Trade not found" });
        if (!(await userMayMutateEscrow(auth, row))) return reply.code(403).send({ error: "Only trade participants can access funding progress" });
        if (action !== "state" && row.buyerUserId !== auth.id) return reply.code(403).send({ error: "Only the buyer can continue funding" });
        try {
          let result;
          if (action === "state") result = await ethereumFunding.get(id);
          else if (action === "prepare") {
            const body = z.object({ requestId: z.string().uuid(), resume: z.boolean().default(false), buyerAddress: z.string() }).parse(req.body);
            if (body.buyerAddress.toLowerCase() !== row.buyerAddress?.toLowerCase()) return reply.code(403).send({ error: "Connect the buyer wallet linked to this trade" });
            result = await ethereumFunding.prepare(id, body.requestId, body.resume);
          } else if (action === "report") {
            const body = z.object({ attemptId: z.string().uuid(), hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(), outcome: z.enum(["rejected", "uncertain"]).optional() }).refine(b => Boolean(b.hash) !== Boolean(b.outcome)).parse(req.body);
            result = await ethereumFunding.report(id, body.attemptId, body);
          } else {
            const body = z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(req.body);
            result = await ethereumFunding.recover(id, body.hash as `0x${string}`);
          }
          if (action !== "state") broadcast("trade:timeline-updated", { escrowId: id });
          return result;
        } catch (error) {
          if (error instanceof FundingError) return reply.code(error.statusCode).send({ error: error.message });
          if (error instanceof z.ZodError) return reply.code(400).send({ error: "Invalid funding request" });
          if (error && typeof error === "object" && "code" in error && error.code === "P2002") return reply.code(409).send({ error: "Another saved wallet request already exists. Refresh to continue it." });
          // Do not expose private RPC URLs/keys through provider errors.
          return reply.code(503).send({ error: "We could not verify the Ethereum request. Your saved progress is kept. Refresh to check again; do not start another payment." });
        }
      },
    });
  }
}
