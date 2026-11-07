CREATE TABLE "AgentActivity" (
  "id" TEXT NOT NULL,
  "agent_user_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "dispute_id" TEXT,
  "escrow_id" TEXT,
  "summary" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_agent_user_id_fkey"
  FOREIGN KEY ("agent_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "AgentActivity_created_at_idx" ON "AgentActivity"("created_at" DESC);
CREATE INDEX "AgentActivity_agent_user_id_created_at_idx" ON "AgentActivity"("agent_user_id", "created_at" DESC);
