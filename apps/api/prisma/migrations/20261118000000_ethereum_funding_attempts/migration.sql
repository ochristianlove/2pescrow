CREATE TABLE "EthereumFundingAttempt" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "escrow_id" TEXT NOT NULL,
  "buyer_address" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "to_address" TEXT NOT NULL,
  "data" TEXT NOT NULL,
  "nonce" INTEGER NOT NULL,
  "start_block" BIGINT NOT NULL,
  "scan_block" BIGINT NOT NULL,
  "tx_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "gas_paid_wei" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EthereumFundingAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EthereumFundingAttempt_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EthereumFundingAttempt_request_id_key" ON "EthereumFundingAttempt"("request_id");
CREATE INDEX "EthereumFundingAttempt_escrow_id_created_at_idx" ON "EthereumFundingAttempt"("escrow_id", "created_at");
CREATE INDEX "EthereumFundingAttempt_buyer_address_nonce_idx" ON "EthereumFundingAttempt"("buyer_address", "nonce");
-- Database-enforced across API processes and devices. A wallet cannot prepare competing trade nonces.
CREATE UNIQUE INDEX "EthereumFundingAttempt_one_active_trade" ON "EthereumFundingAttempt"("escrow_id") WHERE "active";
CREATE UNIQUE INDEX "EthereumFundingAttempt_one_active_wallet" ON "EthereumFundingAttempt"("buyer_address") WHERE "active";
