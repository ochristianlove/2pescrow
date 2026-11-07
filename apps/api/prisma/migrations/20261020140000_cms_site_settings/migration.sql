ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "site_title" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "site_logo_url" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "meta_description" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "meta_keywords" TEXT;
