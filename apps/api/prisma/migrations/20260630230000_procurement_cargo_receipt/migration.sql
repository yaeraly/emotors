ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "cargoTotalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "cargoCompany" TEXT;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "cargoReceiptNumber" TEXT;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "cargoReceiptDate" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "cargoReceiptNote" TEXT;
