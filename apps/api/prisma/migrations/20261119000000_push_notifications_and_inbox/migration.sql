-- AlterTable Notification
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "user_id" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "event_id" TEXT;
ALTER TABLE "Notification" ALTER COLUMN "user_address" SET DEFAULT '';

-- AddForeignKey Notification user
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_user_id_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-link Notification escrow with CASCADE
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_escrow_id_fkey";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes for Notification
CREATE INDEX IF NOT EXISTS "Notification_user_id_created_at_idx" ON "Notification"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "Notification_user_id_read_at_idx" ON "Notification"("user_id", "read_at");
CREATE INDEX IF NOT EXISTS "Notification_escrow_id_idx" ON "Notification"("escrow_id");
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_user_id_event_id_key" ON "Notification"("user_id", "event_id") WHERE "event_id" IS NOT NULL;

-- CreateTable DevicePushToken
CREATE TABLE IF NOT EXISTS "DevicePushToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "device_id" TEXT,
    "app_version" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX IF NOT EXISTS "DevicePushToken_user_id_is_active_idx" ON "DevicePushToken"("user_id", "is_active");

ALTER TABLE "DevicePushToken" DROP CONSTRAINT IF EXISTS "DevicePushToken_user_id_fkey";
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable PushDeliveryJob
CREATE TABLE IF NOT EXISTS "PushDeliveryJob" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ticket_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushDeliveryJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PushDeliveryJob_status_next_retry_at_idx" ON "PushDeliveryJob"("status", "next_retry_at");
CREATE INDEX IF NOT EXISTS "PushDeliveryJob_ticket_id_idx" ON "PushDeliveryJob"("ticket_id");

ALTER TABLE "PushDeliveryJob" DROP CONSTRAINT IF EXISTS "PushDeliveryJob_notification_id_fkey";
ALTER TABLE "PushDeliveryJob" ADD CONSTRAINT "PushDeliveryJob_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable NotificationPreference
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "trade_updates" BOOLEAN NOT NULL DEFAULT true,
    "chat_messages" BOOLEAN NOT NULL DEFAULT true,
    "deadline_reminders" BOOLEAN NOT NULL DEFAULT true,
    "lock_screen_privacy" TEXT NOT NULL DEFAULT 'private',
    "sound_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_user_id_key" ON "NotificationPreference"("user_id");

ALTER TABLE "NotificationPreference" DROP CONSTRAINT IF EXISTS "NotificationPreference_user_id_fkey";
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
