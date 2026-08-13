-- HQ Warehouse management extensions

ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "country" TEXT NOT NULL DEFAULT 'Kyrgyzstan';
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "isHq" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Warehouse_isHq_idx" ON "Warehouse"("isHq");
CREATE INDEX IF NOT EXISTS "Warehouse_deletedAt_idx" ON "Warehouse"("deletedAt");

ALTER TABLE "InventoryBalance" ADD COLUMN IF NOT EXISTS "reservedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryBalance" ADD COLUMN IF NOT EXISTS "landedCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryBalance" ADD COLUMN IF NOT EXISTS "lastReceivingAt" TIMESTAMP(3);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProcurementGoodsReceiving_hqWarehouseId_fkey'
  ) THEN
    ALTER TABLE "ProcurementGoodsReceiving"
      ADD CONSTRAINT "ProcurementGoodsReceiving_hqWarehouseId_fkey"
      FOREIGN KEY ("hqWarehouseId") REFERENCES "Warehouse"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Mark seeded HQ warehouse
UPDATE "Warehouse" SET "isHq" = true, "city" = 'Bishkek', "country" = 'Kyrgyzstan'
WHERE "code" = 'HQ-MAIN' AND "deletedAt" IS NULL;
