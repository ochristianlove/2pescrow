ALTER TABLE "PlatformSettings" ADD COLUMN "reminders_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "reminder_email_subject" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "reminder_email_body" TEXT;
