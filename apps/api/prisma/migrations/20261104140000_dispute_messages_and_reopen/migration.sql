ALTER TABLE "ChatMessage"
ADD COLUMN "recipient_user_id" TEXT;

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_recipient_user_id_fkey"
FOREIGN KEY ("recipient_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ChatMessage_recipient_user_id_idx" ON "ChatMessage"("recipient_user_id");

ALTER TABLE "PlatformSettings"
ADD COLUMN "dispute_appeal_message" TEXT NOT NULL DEFAULT 'A provisional ruling favored {favoredParty}. You may appeal within {appealDays} days. Log in and return to this trade to submit your appeal before {appealDeadline}.',
ADD COLUMN "dispute_final_message" TEXT NOT NULL DEFAULT 'A final ruling favored {favoredParty}. This ruling is final and the appeal window is closed.';
