ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "feedback_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "display_name" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "page_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "admin_note" TEXT,
    "email_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeedbackSubmission_status_created_at_idx" ON "FeedbackSubmission"("status", "created_at" DESC);

ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
