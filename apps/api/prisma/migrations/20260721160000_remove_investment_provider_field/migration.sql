-- Remove FinanceInvestment.providedBy ("Кто предоставил инвестицию")
-- and add soft-delete columns for CEO delete workflow.

ALTER TABLE "FinanceInvestment" DROP COLUMN IF EXISTS "providedBy";

ALTER TABLE "FinanceInvestment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "FinanceInvestment" ADD COLUMN IF NOT EXISTS "deletedById" TEXT;
ALTER TABLE "FinanceInvestment" ADD COLUMN IF NOT EXISTS "deletionReason" TEXT;
ALTER TABLE "FinanceInvestment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "FinanceInvestment_deletedAt_idx" ON "FinanceInvestment"("deletedAt");

DO $$ BEGIN
  ALTER TABLE "FinanceInvestment"
    ADD CONSTRAINT "FinanceInvestment_deletedById_fkey"
    FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
