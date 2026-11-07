import assert from "node:assert/strict";
import path from "path";
import test from "node:test";
import dotenv from "dotenv";
import { faqSortOrders } from "./faqOrder";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

test("published FAQ entries keep admin order and drafts stay off the public list", async () => {
  const { prisma } = await import("./db");
  const stamp = `FAQ test ${Date.now()}`;
  const created = await prisma.faqEntry.create({
    data: { question: `${stamp} draft?`, answer: "This draft answer stays off the homepage.", published: false, sortOrder: 1000 },
  });
  const live = await prisma.faqEntry.create({
    data: { question: `${stamp} live?`, answer: "This published answer is long enough for the homepage.", published: true, sortOrder: 1001 },
  });
  try {
    const seeded = await prisma.faqEntry.findMany({ where: { id: { startsWith: "faq-" } }, orderBy: { sortOrder: "asc" } });
    assert.equal(seeded.length, 10);
    assert.equal(seeded[0]?.question, "What does a referrer earn?");
    assert.equal(seeded.find((row) => row.id === "faq-safety-funds")?.question, "How are the funds protected?");

    const publicRows = await prisma.faqEntry.findMany({ where: { published: true, question: { startsWith: stamp } } });
    assert.deepEqual(publicRows.map((row) => row.id), [live.id]);

    const all = await prisma.faqEntry.findMany({ select: { id: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
    const flipped = [live.id, created.id, ...all.filter((row) => row.id !== live.id && row.id !== created.id).map((row) => row.id)];
    const ordered = faqSortOrders(all.map((row) => row.id), flipped);
    assert.equal(ordered.ok, true);
    if (ordered.ok) {
      await prisma.$transaction(ordered.orders.map((row) => prisma.faqEntry.update({ where: { id: row.id }, data: { sortOrder: row.sortOrder } })));
      const first = await prisma.faqEntry.findFirst({ where: { published: true }, orderBy: { sortOrder: "asc" } });
      assert.equal(first?.id, live.id);
    }
  } finally {
    const original = [
      ["faq-referrer-earn", 0],
      ["faq-agent-earn", 1],
      ["faq-agent-withheld", 2],
      ["faq-agent-referral-stack", 3],
    ] as const;
    await prisma.faqEntry.deleteMany({ where: { id: { in: [created.id, live.id] } } });
    await prisma.$transaction(original.map(([id, sortOrder]) => prisma.faqEntry.update({ where: { id }, data: { sortOrder } })));
    await prisma.$disconnect();
  }
});
