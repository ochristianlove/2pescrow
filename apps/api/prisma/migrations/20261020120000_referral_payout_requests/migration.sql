ALTER TABLE "ReferralCommission" ADD COLUMN IF NOT EXISTS "commission_bps" INTEGER NOT NULL DEFAULT 200;

CREATE TABLE IF NOT EXISTS "ReferralPayoutRequest" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "amount_atomic" TEXT NOT NULL,
    "payout_address" TEXT NOT NULL,
    "payout_chain" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "admin_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralPayoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferralPayoutRequest_referrer_id_idx" ON "ReferralPayoutRequest"("referrer_id");
CREATE INDEX IF NOT EXISTS "ReferralPayoutRequest_status_idx" ON "ReferralPayoutRequest"("status");

ALTER TABLE "ReferralPayoutRequest" ADD CONSTRAINT "ReferralPayoutRequest_referrer_id_fkey"
    FOREIGN KEY ("referrer_id") REFERENCES "Referrer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
