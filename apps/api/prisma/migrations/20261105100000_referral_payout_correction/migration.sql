ALTER TABLE "ReferralCommission"
ADD COLUMN "payout_request_id" TEXT;

CREATE INDEX "ReferralCommission_payout_request_id_idx"
ON "ReferralCommission"("payout_request_id");

ALTER TABLE "ReferralCommission"
ADD CONSTRAINT "ReferralCommission_payout_request_id_fkey"
FOREIGN KEY ("payout_request_id") REFERENCES "ReferralPayoutRequest"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
