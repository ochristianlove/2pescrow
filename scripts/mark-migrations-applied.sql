INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'manual', NOW(), '20261020090000_referrals', NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261020090000_referrals');

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'manual', NOW(), '20261020100000_tron_support', NULL, NULL, NOW(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261020100000_tron_support');
