ALTER TABLE "Dispute" ADD COLUMN "ruled_by_user_id" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "ruling_note" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "ruled_at" TIMESTAMP(3);
ALTER TABLE "Dispute" ADD COLUMN "appeal_deadline_at" TIMESTAMP(3);
ALTER TABLE "Dispute" ADD COLUMN "on_chain_resolve_tx_hash" TEXT;

CREATE TABLE "DisputeAppeal" (
  "id" TEXT NOT NULL,
  "dispute_id" TEXT NOT NULL,
  "filed_by_user_id" TEXT NOT NULL,
  "filed_by_party" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "decided_by_user_id" TEXT,
  "decision_note" TEXT,
  "uphold_ruling" BOOLEAN,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeAppeal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DisputeAppeal_dispute_id_key" ON "DisputeAppeal"("dispute_id");

ALTER TABLE "DisputeAppeal" ADD CONSTRAINT "DisputeAppeal_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
