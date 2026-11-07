-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "address" TEXT NOT NULL,
    "role_tag" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "fee_bps" INTEGER NOT NULL DEFAULT 500,
    "disputes_resolved" INTEGER NOT NULL DEFAULT 0,
    "disputes_won" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Agent_wallet_address_key" ON "Agent"("wallet_address");

CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "contract_address" TEXT,
    "buyer_address" TEXT NOT NULL,
    "seller_address" TEXT NOT NULL,
    "agent_address" TEXT,
    "token_address" TEXT NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "amount_atomic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Created',
    "proof_hash" TEXT,
    "proof_file_path" TEXT,
    "create_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Escrow_contract_address_key" ON "Escrow"("contract_address");

CREATE TABLE "EscrowEvent" (
    "id" BIGSERIAL NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "block_number" BIGINT,
    "tx_hash" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EscrowEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT NOT NULL,
    "opened_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "buyer_favor" BOOLEAN,
    "resolver_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DisputeEvidence" (
    "id" TEXT NOT NULL,
    "dispute_id" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "file_path" TEXT,
    "content_hash" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "escrow_id" TEXT,
    "user_address" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSettings" (
    "id" INTEGER NOT NULL,
    "fee_recipient_wallet" TEXT NOT NULL,
    "resolution_mode" TEXT NOT NULL DEFAULT 'admin',
    "agent_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "usdc_address" TEXT NOT NULL,
    "usdt_address" TEXT NOT NULL,
    "third_stablecoin_address" TEXT NOT NULL,
    "factory_address" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EscrowEvent" ADD CONSTRAINT "EscrowEvent_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DisputeEvidence" ADD CONSTRAINT "DisputeEvidence_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_escrow_id_fkey" FOREIGN KEY ("escrow_id") REFERENCES "Escrow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
