-- CreateEnum
CREATE TYPE "ProductPriceOverrideStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProductPriceOverride" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "overridePriceKgs" DECIMAL(14,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ProductPriceOverrideStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPriceOverride_branchId_idx" ON "ProductPriceOverride"("branchId");

-- CreateIndex
CREATE INDEX "ProductPriceOverride_productId_idx" ON "ProductPriceOverride"("productId");

-- CreateIndex
CREATE INDEX "ProductPriceOverride_branchId_productId_idx" ON "ProductPriceOverride"("branchId", "productId");

-- CreateIndex
CREATE INDEX "ProductPriceOverride_status_idx" ON "ProductPriceOverride"("status");

-- CreateIndex
CREATE INDEX "ProductPriceOverride_startDate_endDate_idx" ON "ProductPriceOverride"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "ProductPriceOverride" ADD CONSTRAINT "ProductPriceOverride_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceOverride" ADD CONSTRAINT "ProductPriceOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceOverride" ADD CONSTRAINT "ProductPriceOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceOverride" ADD CONSTRAINT "ProductPriceOverride_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
