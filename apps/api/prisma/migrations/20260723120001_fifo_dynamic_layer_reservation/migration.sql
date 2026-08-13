-- FIFO dynamic pricing: layer reservation + per-allocation profit/markup
ALTER TABLE "FifoInventoryBatch" ADD COLUMN IF NOT EXISTS "reservedQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DistributionFifoAllocation" ADD COLUMN IF NOT EXISTS "markupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE "DistributionFifoAllocation" ADD COLUMN IF NOT EXISTS "profitKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "DistributionFifoAllocation" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'CONSUMED';

CREATE INDEX IF NOT EXISTS "DistributionFifoAllocation_status_idx" ON "DistributionFifoAllocation"("status");
