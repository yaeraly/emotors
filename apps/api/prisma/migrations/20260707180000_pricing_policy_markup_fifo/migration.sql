-- CreateEnum
CREATE TYPE "ProductPricingMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable Product
ALTER TABLE "Product"
ADD COLUMN "costPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "pricingMode" "ProductPricingMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "wholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "hqBranchWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "recommendedRetailMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "minimumSellingMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

UPDATE "Product"
SET "costPriceKgs" = "finalCostKgs"
WHERE "deletedAt" IS NULL;

-- AlterTable ProductCategory
ALTER TABLE "ProductCategory"
ADD COLUMN "wholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "hqBranchWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "recommendedRetailMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "minimumSellingMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- AlterTable ProductPricingChangeHistory
ALTER TABLE "ProductPricingChangeHistory"
ADD COLUMN "oldMarkup" TEXT,
ADD COLUMN "newMarkup" TEXT,
ADD COLUMN "pricingMode" "ProductPricingMode";

-- CreateTable FifoInventoryBatch
CREATE TABLE "FifoInventoryBatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "stockMovementId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unitCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "initialQuantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FifoInventoryBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable SaleFifoAllocation
CREATE TABLE "SaleFifoAllocation" (
    "id" TEXT NOT NULL,
    "saleId" TEXT,
    "saleItemId" TEXT,
    "fifoBatchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostKgs" DECIMAL(14,2) NOT NULL,
    "totalCostKgs" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleFifoAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FifoInventoryBatch_stockMovementId_key" ON "FifoInventoryBatch"("stockMovementId");
CREATE INDEX "FifoInventoryBatch_productId_idx" ON "FifoInventoryBatch"("productId");
CREATE INDEX "FifoInventoryBatch_warehouseId_idx" ON "FifoInventoryBatch"("warehouseId");
CREATE INDEX "FifoInventoryBatch_receivedAt_idx" ON "FifoInventoryBatch"("receivedAt");
CREATE INDEX "FifoInventoryBatch_remainingQuantity_idx" ON "FifoInventoryBatch"("remainingQuantity");
CREATE INDEX "SaleFifoAllocation_saleId_idx" ON "SaleFifoAllocation"("saleId");
CREATE INDEX "SaleFifoAllocation_saleItemId_idx" ON "SaleFifoAllocation"("saleItemId");
CREATE INDEX "SaleFifoAllocation_fifoBatchId_idx" ON "SaleFifoAllocation"("fifoBatchId");
CREATE INDEX "SaleFifoAllocation_productId_idx" ON "SaleFifoAllocation"("productId");

ALTER TABLE "FifoInventoryBatch" ADD CONSTRAINT "FifoInventoryBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FifoInventoryBatch" ADD CONSTRAINT "FifoInventoryBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleFifoAllocation" ADD CONSTRAINT "SaleFifoAllocation_fifoBatchId_fkey" FOREIGN KEY ("fifoBatchId") REFERENCES "FifoInventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleFifoAllocation" ADD CONSTRAINT "SaleFifoAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
