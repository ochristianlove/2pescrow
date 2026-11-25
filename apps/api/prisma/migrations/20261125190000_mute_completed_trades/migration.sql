ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "mute_completed_trades" BOOLEAN NOT NULL DEFAULT false;
