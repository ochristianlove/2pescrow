-- Case ownership, agent recommendation handoff, and private staff chat
ALTER TABLE "Dispute" ADD COLUMN "owner_user_id" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "claimed_at" TIMESTAMP(3);
ALTER TABLE "Dispute" ADD COLUMN "awaiting_ruling_tier" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "recommendation_buyer_favor" BOOLEAN;
ALTER TABLE "Dispute" ADD COLUMN "recommendation_note" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "recommended_at" TIMESTAMP(3);
ALTER TABLE "Dispute" ADD COLUMN "recommended_by_user_id" TEXT;

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_recommended_by_user_id_fkey"
  FOREIGN KEY ("recommended_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Dispute"
SET "owner_user_id" = COALESCE("assigned_moderator_user_id", "assigned_agent_user_id"),
    "claimed_at" = COALESCE("assigned_at", "assigned_agent_at")
WHERE "owner_user_id" IS NULL
  AND ("assigned_moderator_user_id" IS NOT NULL OR "assigned_agent_user_id" IS NOT NULL);

CREATE TABLE "DisputeStaffMessage" (
  "id" TEXT NOT NULL,
  "dispute_id" TEXT NOT NULL,
  "author_user_id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeStaffMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DisputeStaffMessage_dispute_id_created_at_idx" ON "DisputeStaffMessage"("dispute_id", "created_at");

ALTER TABLE "DisputeStaffMessage" ADD CONSTRAINT "DisputeStaffMessage_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeStaffMessage" ADD CONSTRAINT "DisputeStaffMessage_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
