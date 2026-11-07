ALTER TABLE "Escrow" ALTER COLUMN "buyer_address" DROP NOT NULL;
ALTER TABLE "Escrow" ALTER COLUMN "seller_address" DROP NOT NULL;
ALTER TABLE "Escrow"
  ADD COLUMN "trade_code" TEXT,
  ADD COLUMN "buyer_user_id" TEXT,
  ADD COLUMN "seller_user_id" TEXT,
  ADD COLUMN "join_deadline_at" TIMESTAMP(3),
  ADD COLUMN "fund_deadline_at" TIMESTAMP(3),
  ADD COLUMN "delivery_deadline_at" TIMESTAMP(3),
  ADD COLUMN "review_deadline_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "Escrow_trade_code_key" ON "Escrow"("trade_code");
CREATE INDEX "Escrow_buyer_user_id_idx" ON "Escrow"("buyer_user_id");
CREATE INDEX "Escrow_seller_user_id_idx" ON "Escrow"("seller_user_id");
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "escrow_id" TEXT NOT NULL,
  "author_user_id" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'user',
  "body" TEXT NOT NULL,
  "file_path" TEXT,
  "file_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChatMessage_escrow_id_created_at_idx" ON "ChatMessage"("escrow_id", "created_at");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Dispute"
  ADD COLUMN "handled_by_admin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "handled_by_admin_at" TIMESTAMP(3),
  ADD COLUMN "handled_by_admin_user_id" TEXT;
ALTER TABLE "PlatformSettings"
  ADD COLUMN "join_window_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "fund_window_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "delivery_window_hours" INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN "review_window_hours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "Escrow" ADD COLUMN "delivery_window_hours" INTEGER NOT NULL DEFAULT 72, ADD COLUMN "review_window_hours" INTEGER NOT NULL DEFAULT 48;
