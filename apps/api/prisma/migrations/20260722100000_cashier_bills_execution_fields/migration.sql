-- HQ Cashier execution tracking on supplier payment tasks.
ALTER TABLE "ProcurementSupplierPayment"
  ADD COLUMN IF NOT EXISTS "executionStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "executionStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_executionStatus_idx"
  ON "ProcurementSupplierPayment"("executionStatus");

-- Backfill: payments already at cashier become PENDING_EXECUTION.
UPDATE "ProcurementSupplierPayment"
SET "executionStatus" = 'PENDING_EXECUTION'
WHERE "status" = 'PENDING_CASHIER'
  AND ("executionStatus" IS NULL OR "executionStatus" = '');

UPDATE "ProcurementSupplierPayment"
SET "executionStatus" = 'COMPLETED'
WHERE "status" = 'ACTIVE'
  AND ("executionStatus" IS NULL OR "executionStatus" = '');

UPDATE "ProcurementSupplierPayment"
SET "executionStatus" = 'RETURNED_TO_ACCOUNTANT'
WHERE "status" = 'RETURNED'
  AND ("executionStatus" IS NULL OR "executionStatus" = '');

-- HQ Cashier execution tracking on transport expense payment tasks.
ALTER TABLE "ProcurementTransportExpense"
  ADD COLUMN IF NOT EXISTS "executionStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "executionStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_executionStatus_idx"
  ON "ProcurementTransportExpense"("executionStatus");

UPDATE "ProcurementTransportExpense"
SET "executionStatus" = 'PENDING_EXECUTION'
WHERE "status" IN ('PENDING_CASHIER', 'PARTIALLY_PAID')
  AND ("executionStatus" IS NULL OR "executionStatus" = '');

UPDATE "ProcurementTransportExpense"
SET "executionStatus" = 'COMPLETED'
WHERE "status" = 'PAID'
  AND ("executionStatus" IS NULL OR "executionStatus" = '');

UPDATE "ProcurementTransportExpense"
SET "executionStatus" = 'RETURNED_TO_ACCOUNTANT'
WHERE "status" = 'RETURNED'
  AND ("executionStatus" IS NULL OR "executionStatus" = '');

-- Cashier lifecycle notifications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AlertType' AND e.enumlabel = 'CASHIER_PAYMENT_STARTED'
  ) THEN
    ALTER TYPE "AlertType" ADD VALUE 'CASHIER_PAYMENT_STARTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AlertType' AND e.enumlabel = 'CASHIER_PAYMENT_FAILED'
  ) THEN
    ALTER TYPE "AlertType" ADD VALUE 'CASHIER_PAYMENT_FAILED';
  END IF;
END $$;
