ALTER TABLE "PlatformSettings" ADD COLUMN "telegram_url" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "x_url" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN "discord_url" TEXT;

CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_published_published_at_idx" ON "BlogPost"("published", "published_at" DESC);
