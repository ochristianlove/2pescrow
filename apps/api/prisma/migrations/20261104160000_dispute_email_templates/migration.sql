ALTER TABLE "PlatformSettings"
ADD COLUMN "dispute_email_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "dispute_appeal_email_subject" VARCHAR(180) NOT NULL DEFAULT 'A ruling is ready for appeal',
ADD COLUMN "dispute_final_email_subject" VARCHAR(180) NOT NULL DEFAULT 'Final dispute ruling',
ADD COLUMN "dispute_appeal_decision_message" TEXT NOT NULL DEFAULT 'The appeal for {tradeTitle} has been reviewed. The final ruling favors {favoredParty}. Trade: {tradeUrl}',
ADD COLUMN "dispute_appeal_decision_email_subject" VARCHAR(180) NOT NULL DEFAULT 'Your dispute appeal has been decided';
