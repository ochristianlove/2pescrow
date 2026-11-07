ALTER TABLE "DisputeEvidence" ADD COLUMN "file_name" TEXT;

CREATE TABLE "TradeRecord" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshot_hash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TradeRecord_escrow_id_created_at_idx" ON "TradeRecord"("escrow_id", "created_at");
ALTER TABLE "TradeRecord" ADD CONSTRAINT "TradeRecord_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
