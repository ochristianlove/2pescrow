-- Separate agent case commissions from referral commissions.
CREATE TABLE "AgentCommissionProfile" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "payout_address" TEXT,
  "payout_chain" TEXT,
  "commission_bps" INTEGER,
  "opted_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cooling_off_ends_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentCommissionProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCommissionProfile_user_id_key" ON "AgentCommissionProfile"("user_id");

CREATE TABLE "AgentPayoutRequest" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "amount_atomic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "admin_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "AgentPayoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentPayoutRequest_profile_id_status_idx" ON "AgentPayoutRequest"("profile_id", "status");
CREATE INDEX "AgentPayoutRequest_status_created_at_idx" ON "AgentPayoutRequest"("status", "created_at");

CREATE TABLE "AgentCaseCommission" (
  "id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "escrow_id" TEXT NOT NULL,
  "dispute_id" TEXT,
  "commission_bps" INTEGER NOT NULL,
  "platform_profit_atomic" TEXT NOT NULL,
  "commission_atomic" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "finalized_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "payout_request_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentCaseCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCaseCommission_escrow_id_key" ON "AgentCaseCommission"("escrow_id");
CREATE INDEX "AgentCaseCommission_profile_id_status_idx" ON "AgentCaseCommission"("profile_id", "status");

ALTER TABLE "AgentCommissionProfile" ADD CONSTRAINT "AgentCommissionProfile_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPayoutRequest" ADD CONSTRAINT "AgentPayoutRequest_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "AgentCommissionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCaseCommission" ADD CONSTRAINT "AgentCaseCommission_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "AgentCommissionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCaseCommission" ADD CONSTRAINT "AgentCaseCommission_payout_request_id_fkey"
  FOREIGN KEY ("payout_request_id") REFERENCES "AgentPayoutRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
