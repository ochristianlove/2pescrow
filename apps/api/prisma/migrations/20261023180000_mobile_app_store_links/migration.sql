ALTER TABLE "PlatformSettings"
ADD COLUMN "mobile_apps_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ios_app_store_url" TEXT,
ADD COLUMN "android_play_store_url" TEXT;
