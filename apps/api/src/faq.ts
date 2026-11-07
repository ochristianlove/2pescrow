import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { prisma } from "./db";
import { requireAdmin } from "./auth";
import { faqSortOrders } from "./faqOrder";

const writeSchema = z.object({
  question: z.string().trim().min(3).max(240),
  answer: z.string().trim().min(10).max(4000),
  published: z.boolean().optional(),
});

function parseWrite<T>(schema: z.ZodType<T>, raw: unknown, reply: FastifyReply): T | null {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  reply.code(400).send({ error: issue?.message || "Check the question and answer." });
  return null;
}

const publicSelect = { id: true, question: true, answer: true, sortOrder: true } as const;

export function registerFaqRoutes(app: FastifyInstance) {
  app.get("/v1/faq", async () => {
    return prisma.faqEntry.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: publicSelect,
    });
  });

  app.get("/v1/admin/faq", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    return prisma.faqEntry.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  });

  app.post("/v1/admin/faq", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = parseWrite(writeSchema, req.body, reply);
    if (!body) return;
    const last = await prisma.faqEntry.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    return prisma.faqEntry.create({
      data: {
        question: body.question,
        answer: body.answer,
        published: body.published ?? false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  });

  app.patch("/v1/admin/faq/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.faqEntry.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "FAQ not found" });
    const body = parseWrite(writeSchema.partial(), req.body ?? {}, reply);
    if (!body) return;
    return prisma.faqEntry.update({
      where: { id },
      data: {
        question: body.question ?? existing.question,
        answer: body.answer ?? existing.answer,
        published: body.published ?? existing.published,
      },
    });
  });

  app.post("/v1/admin/faq/reorder", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = z.object({ ids: z.array(z.string().min(1)).max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Send the FAQ ids in the new order." });
    const existing = await prisma.faqEntry.findMany({ select: { id: true } });
    const ordered = faqSortOrders(existing.map((row) => row.id), body.data.ids);
    if (!ordered.ok) return reply.code(400).send({ error: ordered.error });
    await prisma.$transaction(
      ordered.orders.map((row) => prisma.faqEntry.update({ where: { id: row.id }, data: { sortOrder: row.sortOrder } })),
    );
    return prisma.faqEntry.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  });

  app.delete("/v1/admin/faq/:id", async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const { id } = req.params as { id: string };
    const existing = await prisma.faqEntry.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "FAQ not found" });
    await prisma.faqEntry.delete({ where: { id } });
    return { ok: true };
  });
}
