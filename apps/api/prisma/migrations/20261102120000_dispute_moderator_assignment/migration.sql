-- Per-dispute moderator assignment (admin delegates dispute handling)
ALTER TABLE "Dispute" ADD COLUMN "assigned_moderator_user_id" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "assigned_by_user_id" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "assigned_at" TIMESTAMP(3);

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assigned_moderator_user_id_fkey"
  FOREIGN KEY ("assigned_moderator_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
