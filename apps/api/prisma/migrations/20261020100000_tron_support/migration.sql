-- Tron support (disabled by default via tron_support_enabled)
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "tron_support_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "tron_usdt_address" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "tron_factory_address" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "tron_fee_recipient_wallet" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN IF NOT EXISTS "tron_resolver_wallet" TEXT;

ALTER TABLE "Escrow" ADD COLUMN IF NOT EXISTS "chain" TEXT NOT NULL DEFAULT 'scroll';

ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "chain_kind" TEXT NOT NULL DEFAULT 'evm';
