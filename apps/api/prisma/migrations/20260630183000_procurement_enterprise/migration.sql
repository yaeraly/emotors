-- Procurement enterprise + landed-cost schema extensions
-- Safe to run on databases that already have the base EMOTORS OS tables.

-- Enum: procurement shortage reasons
DO $$ BEGIN
  CREATE TYPE "ProcurementShortageReason" AS ENUM (
    'FACTORY_SHORTAGE',
    'SUPPLIER_SHORTAGE',
    'DAMAGED_GOODS',
    'LOST_IN_TRANSPORT',
    'CUSTOMS_ISSUE',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Product master extensions
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "defaultSupplierId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "defaultFactoryId" TEXT;

CREATE INDEX IF NOT EXISTS "Product_defaultSupplierId_idx" ON "Product"("defaultSupplierId");
CREATE INDEX IF NOT EXISTS "Product_defaultFactoryId_idx" ON "Product"("defaultFactoryId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Product_defaultSupplierId_fkey'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_defaultSupplierId_fkey"
      FOREIGN KEY ("defaultSupplierId") REFERENCES "Supplier"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Product_defaultFactoryId_fkey'
  ) THEN
    ALTER TABLE "Product"
      ADD CONSTRAINT "Product_defaultFactoryId_fkey"
      FOREIGN KEY ("defaultFactoryId") REFERENCES "Factory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Procurement order header extensions
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'CNY';
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "defaultYuanRate" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "purchaseDate" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "totalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "costPerKg" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "chinaDomesticTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "chinaExportTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "localTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "packagingCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "customsCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "insuranceCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "bankFeeCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "otherExpenseKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Procurement order line extensions
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "factoryId" TEXT;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "receivedQuantity" INTEGER;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "totalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "chinaDomesticAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "chinaExportAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "localTransportAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "packagingAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "customsAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "insuranceAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "bankFeeAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "otherAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "note" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementOrderItem_supplierId_idx" ON "ProcurementOrderItem"("supplierId");
CREATE INDEX IF NOT EXISTS "ProcurementOrderItem_factoryId_idx" ON "ProcurementOrderItem"("factoryId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProcurementOrderItem_supplierId_fkey'
  ) THEN
    ALTER TABLE "ProcurementOrderItem"
      ADD CONSTRAINT "ProcurementOrderItem_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProcurementOrderItem_factoryId_fkey'
  ) THEN
    ALTER TABLE "ProcurementOrderItem"
      ADD CONSTRAINT "ProcurementOrderItem_factoryId_fkey"
      FOREIGN KEY ("factoryId") REFERENCES "Factory"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Shortage report reason
ALTER TABLE "ProcurementDifferenceReport" ADD COLUMN IF NOT EXISTS "shortageReason" "ProcurementShortageReason";
