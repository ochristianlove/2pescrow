-- Tiered dispute resolver: agent assignment, tier preference, escalations, staff notifications
ALTER TABLE "Dispute" ADD COLUMN "requested_resolver_tier" TEXT NOT NULL DEFAULT 'moderator';
ALTER TABLE "Dispute" ADD COLUMN "assigned_agent_user_id" TEXT;
ALTER TABLE "Dispute" ADD COLUMN "assigned_agent_at" TIMESTAMP(3);

ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_assigned_agent_user_id_fkey"
  FOREIGN KEY ("assigned_agent_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Agent" ADD COLUMN "user_id" TEXT;
ALTER TABLE "Agent" ADD COLUMN "external_contact" TEXT;
ALTER TABLE "Agent" ALTER COLUMN "wallet_address" DROP NOT NULL;

CREATE UNIQUE INDEX "Agent_user_id_key" ON "Agent"("user_id");

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DisputeEscalation" (
  "id" TEXT NOT NULL,
  "dispute_id" TEXT NOT NULL,
  "from_user_id" TEXT NOT NULL,
  "from_tier" TEXT NOT NULL,
  "to_tier" TEXT NOT NULL,
  "preliminary_buyer_favor" BOOLEAN,
  "note" TEXT NOT NULL,
  "external_proof" TEXT,
  "chat_summary" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  CONSTRAINT "DisputeEscalation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DisputeEscalation" ADD CONSTRAINT "DisputeEscalation_dispute_id_fkey"
  FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeEscalation" ADD CONSTRAINT "DisputeEscalation_from_user_id_fkey"
  FOREIGN KEY ("from_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "DisputeEscalation_dispute_id_created_at_idx" ON "DisputeEscalation"("dispute_id", "created_at");

CREATE TABLE "StaffNotification" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "dispute_id" TEXT,
  "escrow_id" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffNotification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StaffNotification" ADD CONSTRAINT "StaffNotification_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "StaffNotification_user_id_read_at_idx" ON "StaffNotification"("user_id", "read_at");
