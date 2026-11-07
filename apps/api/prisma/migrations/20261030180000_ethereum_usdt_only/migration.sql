-- New trades default to Ethereum. Existing rows, including older EVM trades, are left unchanged.
ALTER TABLE "Escrow" ALTER COLUMN "chain" SET DEFAULT 'ethereum';

-- Point platform token settings at Ethereum ERC-20 USDT. Does not rewrite escrow history.
UPDATE "PlatformSettings"
SET
  "usdt_address" = '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  "usdc_address" = '0x0000000000000000000000000000000000000000',
  "factory_address" = NULL
WHERE "id" = 1;
