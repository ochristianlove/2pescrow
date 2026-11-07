-- Pause TRC-20 in existing installations for the upcoming app release.
-- Admins can enable it again later from Platform settings.
UPDATE "PlatformSettings"
SET "tron_support_enabled" = false
WHERE "tron_support_enabled" = true;
