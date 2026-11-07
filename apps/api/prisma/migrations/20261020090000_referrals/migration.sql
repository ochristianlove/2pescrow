-- User referral attribution
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referred_by_referrer_id" TEXT;

-- Referrer program
CREATE TABLE IF NOT EXISTS "Referrer" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "referral_code" TEXT NOT NULL,
    "display_name" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'bronze',
    "total_earned_atomic" TEXT NOT NULL DEFAULT '0',
    "total_paid_atomic" TEXT NOT NULL DEFAULT '0',
    "pending_balance_atomic" TEXT NOT NULL DEFAULT '0',
    "successful_referrals" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Referrer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Referrer_user_id_key" ON "Referrer"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Referrer_referral_code_key" ON "Referrer"("referral_code");

CREATE TABLE IF NOT EXISTS "ReferralReferee" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referee_user_id" TEXT NOT NULL,
    "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralReferee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralReferee_referee_user_id_key" ON "ReferralReferee"("referee_user_id");

CREATE TABLE IF NOT EXISTS "ReferralClick" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReferralCommission" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "platform_profit_atomic" TEXT NOT NULL,
    "commission_atomic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCommission_escrow_id_key" ON "ReferralCommission"("escrow_id");

CREATE TABLE IF NOT EXISTS "ReferrerNotification" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferrerNotification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReferralReferee" ADD CONSTRAINT "ReferralReferee_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "Referrer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralReferee" ADD CONSTRAINT "ReferralReferee_referee_user_id_fkey" FOREIGN KEY ("referee_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralClick" ADD CONSTRAINT "ReferralClick_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "Referrer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralCommission" ADD CONSTRAINT "ReferralCommission_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "Referrer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferrerNotification" ADD CONSTRAINT "ReferrerNotification_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "Referrer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
