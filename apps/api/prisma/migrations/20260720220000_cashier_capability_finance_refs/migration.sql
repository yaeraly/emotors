-- Cashier capability finance references (requires FinanceAccount from 20260720200000)

ALTER TABLE "FinanceAccountAssignment" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "FinanceAccountAssignment_branchId_idx" ON "FinanceAccountAssignment"("branchId");
CREATE INDEX IF NOT EXISTS "FinanceAccountAssignment_isActive_idx" ON "FinanceAccountAssignment"("isActive");

DO $$ BEGIN
  ALTER TABLE "FinanceAccountAssignment" ADD CONSTRAINT "FinanceAccountAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "FinanceAccountAssignment" fa
SET "branchId" = a."branchId"
FROM "FinanceAccount" a
WHERE fa."accountId" = a."id" AND fa."branchId" IS NULL;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "financeAccountId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "selfProcessed" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Payment_financeAccountId_idx" ON "Payment"("financeAccountId");

DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_financeAccountId_fkey" FOREIGN KEY ("financeAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
