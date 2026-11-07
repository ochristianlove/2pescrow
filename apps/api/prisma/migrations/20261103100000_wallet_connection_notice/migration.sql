ALTER TABLE "PlatformSettings"
  ADD COLUMN "site_notice_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "site_notice_title" VARCHAR(120) NOT NULL DEFAULT 'Wallet connection help',
  ADD COLUMN "site_notice_body" TEXT NOT NULL DEFAULT 'For the full 2Pescrow experience, connect a supported wallet before starting a trade. A connected wallet is required to fund escrow and complete on-chain actions.

If wallet connection is slow on mobile, try opening 2Pescrow in your wallet’s built-in browser or in a desktop browser. If your network route is causing delays, a VPN may help reduce connection latency.',
  ADD COLUMN "site_notice_revision" INTEGER NOT NULL DEFAULT 1;
