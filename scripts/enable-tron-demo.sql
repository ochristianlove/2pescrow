UPDATE "PlatformSettings"
SET
  tron_support_enabled = true,
  tron_usdt_address = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  tron_factory_address = 'TDemoFactoryNotOnChainYet123456789012',
  tron_fee_recipient_wallet = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
  tron_resolver_wallet = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf'
WHERE id = 1;

SELECT tron_support_enabled, tron_usdt_address, tron_factory_address FROM "PlatformSettings";
