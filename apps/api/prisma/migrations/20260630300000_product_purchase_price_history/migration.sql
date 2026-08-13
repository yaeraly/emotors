-- CreateEnum
CREATE TYPE "PurchasePriceChangeReason" AS ENUM ('SUPPLIER_PRICE_CHANGE', 'NEW_PROCUREMENT', 'FACTORY_PRICE_UPDATE', 'MANUAL_CORRECTION');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "purchasePriceUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductPurchasePriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "factoryId" TEXT,
    "oldPriceYuan" DECIMAL(14,2) NOT NULL,
    "newPriceYuan" DECIMAL(14,2) NOT NULL,
    "differenceYuan" DECIMAL(14,2) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" "PurchasePriceChangeReason" NOT NULL,
    "note" TEXT,
    "procurementOrderId" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPurchasePriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPurchasePriceHistory_productId_idx" ON "ProductPurchasePriceHistory"("productId");

-- CreateIndex
CREATE INDEX "ProductPurchasePriceHistory_supplierId_idx" ON "ProductPurchasePriceHistory"("supplierId");

-- CreateIndex
CREATE INDEX "ProductPurchasePriceHistory_factoryId_idx" ON "ProductPurchasePriceHistory"("factoryId");

-- CreateIndex
CREATE INDEX "ProductPurchasePriceHistory_changedById_idx" ON "ProductPurchasePriceHistory"("changedById");

-- CreateIndex
CREATE INDEX "ProductPurchasePriceHistory_effectiveDate_idx" ON "ProductPurchasePriceHistory"("effectiveDate");

-- CreateIndex
CREATE INDEX "ProductPurchasePriceHistory_procurementOrderId_idx" ON "ProductPurchasePriceHistory"("procurementOrderId");

-- AddForeignKey
ALTER TABLE "ProductPurchasePriceHistory" ADD CONSTRAINT "ProductPurchasePriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchasePriceHistory" ADD CONSTRAINT "ProductPurchasePriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchasePriceHistory" ADD CONSTRAINT "ProductPurchasePriceHistory_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchasePriceHistory" ADD CONSTRAINT "ProductPurchasePriceHistory_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPurchasePriceHistory" ADD CONSTRAINT "ProductPurchasePriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
