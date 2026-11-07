ALTER TABLE "Dispute" ADD COLUMN "opened_by_user_id" TEXT;

UPDATE "Dispute" AS dispute
SET "opened_by_user_id" = "User"."id"
FROM "User"
WHERE dispute."opened_by_user_id" IS NULL
  AND "User"."email" IS NOT NULL
  AND LOWER("User"."email") = LOWER(dispute."opened_by");

ALTER TABLE "Dispute"
  ADD CONSTRAINT "Dispute_opened_by_user_id_fkey"
  FOREIGN KEY ("opened_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Dispute_opened_by_user_id_idx" ON "Dispute"("opened_by_user_id");
