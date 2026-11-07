CREATE TABLE "AgentApplication" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "applicant_note" TEXT,
  "volume_atomic_at_apply" TEXT NOT NULL,
  "reviewed_by_user_id" TEXT,
  "review_note" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentApplication_status_created_at_idx" ON "AgentApplication"("status", "created_at" DESC);
CREATE INDEX "AgentApplication_user_id_created_at_idx" ON "AgentApplication"("user_id", "created_at" DESC);

ALTER TABLE "AgentApplication" ADD CONSTRAINT "AgentApplication_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentApplication" ADD CONSTRAINT "AgentApplication_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
