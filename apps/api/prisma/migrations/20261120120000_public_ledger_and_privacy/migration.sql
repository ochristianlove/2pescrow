-- Public ledger membership is maintained by the trigger so list queries
-- can use one indexed predicate instead of a five-way OR.
ALTER TABLE "Escrow" ADD COLUMN "on_public_ledger" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "hide_from_public_ledger" BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION set_escrow_on_public_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.on_public_ledger :=
    NEW.contract_address IS NOT NULL
    OR NEW.create_tx_hash IS NOT NULL
    OR NEW.status IN ('Funded', 'InProgress', 'Completed', 'Resolved', 'Disputed', 'Refunded')
    OR (
      NEW.buyer_address IS NOT NULL
      AND NEW.seller_address IS NOT NULL
      AND NEW.status IN ('AwaitingFunding', 'Funded', 'InProgress', 'Completed', 'Resolved', 'Disputed')
    )
    OR (
      NEW.buyer_user_id IS NOT NULL
      AND NEW.seller_user_id IS NOT NULL
      AND NEW.status <> 'Created'
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER escrow_public_ledger_flag
BEFORE INSERT OR UPDATE ON "Escrow"
FOR EACH ROW
EXECUTE PROCEDURE set_escrow_on_public_ledger();

UPDATE "Escrow" SET "on_public_ledger" = "on_public_ledger";

CREATE INDEX "Escrow_on_public_ledger_updated_at_idx" ON "Escrow"("on_public_ledger", "updated_at" DESC);
CREATE INDEX "Escrow_buyer_user_id_idx" ON "Escrow"("buyer_user_id");
CREATE INDEX "Escrow_seller_user_id_idx" ON "Escrow"("seller_user_id");
CREATE INDEX "EscrowEvent_escrow_id_id_idx" ON "EscrowEvent"("escrow_id", "id" DESC);
