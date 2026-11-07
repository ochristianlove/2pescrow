ALTER TABLE "PlatformSettings"
ADD COLUMN "site_notice_audience" VARCHAR(16) NOT NULL DEFAULT 'all',
ADD COLUMN "site_notice_delay_seconds" INTEGER NOT NULL DEFAULT 15;
