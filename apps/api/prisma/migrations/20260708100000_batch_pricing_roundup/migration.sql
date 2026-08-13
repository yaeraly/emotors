-- AlterTable FifoInventoryBatch: store calculated batch prices from markups
ALTER TABLE "FifoInventoryBatch"
ADD COLUMN "wholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "wholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "hqBranchWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "hqBranchWholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "recommendedRetailMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "recommendedRetailPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "minimumSellingMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "minimumSellingPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- CreateTable DistributionFifoAllocation
CREATE TABLE "DistributionFifoAllocation" (
    "id" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "distributionOrderItemId" TEXT NOT NULL,
    "fifoBatchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostKgs" DECIMAL(14,2) NOT NULL,
    "unitPriceKgs" DECIMAL(14,2) NOT NULL,
    "wholesalePriceKgs" DECIMAL(14,2) NOT NULL,
    "hqBranchWholesalePriceKgs" DECIMAL(14,2) NOT NULL,
    "totalCostKgs" DECIMAL(14,2) NOT NULL,
    "totalPriceKgs" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionFifoAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DistributionFifoAllocation_distributionOrderId_idx" ON "DistributionFifoAllocation"("distributionOrderId");
CREATE INDEX "DistributionFifoAllocation_distributionOrderItemId_idx" ON "DistributionFifoAllocation"("distributionOrderItemId");
CREATE INDEX "DistributionFifoAllocation_fifoBatchId_idx" ON "DistributionFifoAllocation"("fifoBatchId");
CREATE INDEX "DistributionFifoAllocation_productId_idx" ON "DistributionFifoAllocation"("productId");

ALTER TABLE "DistributionFifoAllocation" ADD CONSTRAINT "DistributionFifoAllocation_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionFifoAllocation" ADD CONSTRAINT "DistributionFifoAllocation_distributionOrderItemId_fkey" FOREIGN KEY ("distributionOrderItemId") REFERENCES "BranchDistributionOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionFifoAllocation" ADD CONSTRAINT "DistributionFifoAllocation_fifoBatchId_fkey" FOREIGN KEY ("fifoBatchId") REFERENCES "FifoInventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DistributionFifoAllocation" ADD CONSTRAINT "DistributionFifoAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
