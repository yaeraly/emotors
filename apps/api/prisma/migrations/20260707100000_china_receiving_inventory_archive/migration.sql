ALTER TYPE "InventoryCountStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

ALTER TABLE "InventoryCountSession" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "ProcurementDifferenceReport" ALTER COLUMN "receivingId" DROP NOT NULL;
ALTER TABLE "ProcurementDifferenceReport" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "ProcurementDifferenceReport" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementDifferenceReport_warehouseId_idx" ON "ProcurementDifferenceReport"("warehouseId");
CREATE INDEX IF NOT EXISTS "ProcurementDifferenceReport_createdById_idx" ON "ProcurementDifferenceReport"("createdById");

DO $$ BEGIN
  ALTER TABLE "ProcurementDifferenceReport" ADD CONSTRAINT "ProcurementDifferenceReport_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementDifferenceReport" ADD CONSTRAINT "ProcurementDifferenceReport_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
