-- Homepage FAQ entries managed from the admin desk.
CREATE TABLE "FaqEntry" (
  "id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FaqEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FaqEntry_published_sort_order_idx" ON "FaqEntry"("published", "sort_order");

INSERT INTO "FaqEntry" ("id", "question", "answer", "published", "sort_order", "created_at", "updated_at") VALUES
(
  'faq-referrer-earn',
  'What does a referrer earn?',
  'Share your link. When someone you referred finishes a successful trade, you earn 2% of the platform fee on that trade. The platform fee is 10% of the trade plus $1 to open it. Your cut is 2% of that fee, not 2% of the whole trade. Cash-out starts at $20, and an admin sends it to your wallet.',
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-agent-earn',
  'What does a dispute agent earn?',
  'An admin approves you before you can handle disputes. Commission does not start at approval. You opt in from your account with your name and a payout wallet. The default rate is 0.5% of the platform fee on a case. It is paid only after that dispute is paid out on-chain. You need 5 finalized cases, and at least $20, before you can cash out.',
  true,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-agent-withheld',
  'When is agent commission withheld?',
  'The first 7 days after you opt in, finished cases are not paid. You also earn nothing on a case where you are the buyer or seller. A recommendation or a provisional ruling does not pay. An admin can set a different rate for one agent, or shorten that 7-day wait. You cannot pick your own rate.',
  true,
  2,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'faq-agent-referral-stack',
  'Can an agent also use the referral program?',
  'Yes. Referral earnings and case commission are separate and they stack. Referring a trader does not replace the pay for handling a dispute, and handling a dispute does not replace the referral cut.',
  true,
  3,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
