-- Supplier invoice review workflow fields (centralized HQ Accountant bills).
ALTER TABLE "ProcurementOrder"
  ADD COLUMN IF NOT EXISTS "invoiceReviewStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceReturnReason" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceRejectReason" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoiceReviewedById" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementOrder_invoiceReviewStatus_idx"
  ON "ProcurementOrder"("invoiceReviewStatus");

-- Backfill existing invoices awaiting accountant.
UPDATE "ProcurementOrder"
SET "invoiceReviewStatus" = 'SUBMITTED'
WHERE "invoiceSentToAccountantAt" IS NOT NULL
  AND "invoiceReviewStatus" IS NULL
  AND "supplierPaymentStatus" IN ('AWAITING_ACCOUNTANT', 'UNPAID', 'AWAITING_CASHIER', 'PARTIALLY_PAID');

UPDATE "ProcurementOrder"
SET "invoiceReviewStatus" = 'APPROVED'
WHERE "invoiceSentToAccountantAt" IS NOT NULL
  AND "invoiceReviewStatus" IS NULL
  AND "supplierPaymentStatus" IN ('PAID', 'OVERPAID');

-- Transport expense review / reject statuses.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TransportExpenseStatus' AND e.enumlabel = 'UNDER_REVIEW'
  ) THEN
    ALTER TYPE "TransportExpenseStatus" ADD VALUE 'UNDER_REVIEW' AFTER 'WAITING_ACCOUNTANT';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TransportExpenseStatus' AND e.enumlabel = 'REJECTED'
  ) THEN
    ALTER TYPE "TransportExpenseStatus" ADD VALUE 'REJECTED' AFTER 'RETURNED';
  END IF;
END $$;

-- Alert types for centralized payable workflow (sender notifications).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AlertType' AND e.enumlabel = 'PAYABLE_REQUEST_UNDER_REVIEW'
  ) THEN
    ALTER TYPE "AlertType" ADD VALUE 'PAYABLE_REQUEST_UNDER_REVIEW';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AlertType' AND e.enumlabel = 'PAYABLE_REQUEST_REJECTED'
  ) THEN
    ALTER TYPE "AlertType" ADD VALUE 'PAYABLE_REQUEST_REJECTED';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AlertType' AND e.enumlabel = 'PAYABLE_REQUEST_APPROVED'
  ) THEN
    ALTER TYPE "AlertType" ADD VALUE 'PAYABLE_REQUEST_APPROVED';
  END IF;
END $$;
