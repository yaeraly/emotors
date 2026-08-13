-- Extend shared TransportCompany directory with optional bank details.
ALTER TABLE "TransportCompany"
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccount" TEXT,
  ADD COLUMN IF NOT EXISTS "accountHolder" TEXT;

CREATE INDEX IF NOT EXISTS "TransportCompany_name_idx" ON "TransportCompany"("name");

-- Cargo calculation + partial payment tracking on transport payment requests.
ALTER TABLE "ProcurementTransportExpense"
  ADD COLUMN IF NOT EXISTS "paidAmountKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalWeightKg" DECIMAL(14,3),
  ADD COLUMN IF NOT EXISTS "cargoRateUsdPerKg" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "usdExchangeRate" DECIMAL(14,4),
  ADD COLUMN IF NOT EXISTS "calculatedAmountUsd" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "calculatedAmountKgs" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "cargoReceiptAttachmentId" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_transportCompanyId_idx"
  ON "ProcurementTransportExpense"("transportCompanyId");

-- Safe enum extension for partial cargo/transport payments.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TransportExpenseStatus'
      AND e.enumlabel = 'PARTIALLY_PAID'
  ) THEN
    ALTER TYPE "TransportExpenseStatus" ADD VALUE 'PARTIALLY_PAID' BEFORE 'PAID';
  END IF;
END $$;
