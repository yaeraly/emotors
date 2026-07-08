ALTER TABLE "ProcurementDifferenceReport" ADD COLUMN IF NOT EXISTS "damagedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementGoodsReceivingItem" ADD COLUMN IF NOT EXISTS "damagedQuantity" INTEGER NOT NULL DEFAULT 0;
