-- Apply Finance Transfer workflow columns after new enum values are committed.

ALTER TABLE "FinanceTransfer" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "FinanceTransfer" ALTER COLUMN "requiresApproval" SET DEFAULT true;

ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "transactionNumber" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "sentToCashierAt" TIMESTAMP(3);
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3);
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "returnReason" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "accountantId" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "cashierId" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "returnedById" TEXT;
ALTER TABLE "FinanceTransfer" ADD COLUMN IF NOT EXISTS "reversalOfTransferId" TEXT;

-- Map legacy pending approvals to cashier queue
UPDATE "FinanceTransfer"
SET status = 'PENDING_CASHIER'
WHERE status = 'PENDING';

UPDATE "FinanceTransfer"
SET
  "accountantId" = COALESCE("accountantId", "createdById"),
  "cashierId" = COALESCE("cashierId", "approvedById"),
  "completedAt" = COALESCE("completedAt", "approvedAt")
WHERE status = 'COMPLETED';

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceTransfer_idempotencyKey_key"
  ON "FinanceTransfer"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "FinanceTransfer_accountantId_idx" ON "FinanceTransfer"("accountantId");
CREATE INDEX IF NOT EXISTS "FinanceTransfer_cashierId_idx" ON "FinanceTransfer"("cashierId");
CREATE INDEX IF NOT EXISTS "FinanceTransfer_sentToCashierAt_idx" ON "FinanceTransfer"("sentToCashierAt");

DO $$ BEGIN
  ALTER TABLE "FinanceTransfer"
    ADD CONSTRAINT "FinanceTransfer_accountantId_fkey"
    FOREIGN KEY ("accountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransfer"
    ADD CONSTRAINT "FinanceTransfer_cashierId_fkey"
    FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransfer"
    ADD CONSTRAINT "FinanceTransfer_returnedById_fkey"
    FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FinanceTransfer"
    ADD CONSTRAINT "FinanceTransfer_reversalOfTransferId_fkey"
    FOREIGN KEY ("reversalOfTransferId") REFERENCES "FinanceTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
