-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "MagicLink" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MagicLink_token_hash_key" ON "MagicLink"("token_hash");
CREATE INDEX IF NOT EXISTS "MagicLink_email_idx" ON "MagicLink"("email");
