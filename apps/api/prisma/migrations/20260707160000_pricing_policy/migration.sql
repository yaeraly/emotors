-- CreateEnum
CREATE TYPE "PricingPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "wholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "hqBranchWholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "recommendedRetailPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "minimumSellingPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "maximumDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- Backfill pricing fields from existing selling price
UPDATE "Product"
SET
  "wholesalePriceKgs" = "sellingPriceKgs",
  "hqBranchWholesalePriceKgs" = "sellingPriceKgs",
  "recommendedRetailPriceKgs" = "sellingPriceKgs",
  "minimumSellingPriceKgs" = "sellingPriceKgs",
  "maximumDiscountPercent" = 10
WHERE "deletedAt" IS NULL;

-- CreateTable
CREATE TABLE "ProductPricingPolicy" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT,
    "hqCatalogProductId" TEXT,
    "purchasePriceYuan" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "landedCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "wholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "hqBranchWholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recommendedRetailPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minimumSellingPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maximumDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "status" "PricingPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPricingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPricingChangeHistory" (
    "id" TEXT NOT NULL,
    "policyId" TEXT,
    "productId" TEXT,
    "sku" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPricingChangeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductPricingPolicy_sku_key" ON "ProductPricingPolicy"("sku");
CREATE INDEX "ProductPricingPolicy_status_idx" ON "ProductPricingPolicy"("status");
CREATE INDEX "ProductPricingPolicy_createdById_idx" ON "ProductPricingPolicy"("createdById");
CREATE INDEX "ProductPricingPolicy_updatedById_idx" ON "ProductPricingPolicy"("updatedById");
CREATE INDEX "ProductPricingPolicy_hqCatalogProductId_idx" ON "ProductPricingPolicy"("hqCatalogProductId");
CREATE INDEX "ProductPricingChangeHistory_policyId_idx" ON "ProductPricingChangeHistory"("policyId");
CREATE INDEX "ProductPricingChangeHistory_productId_idx" ON "ProductPricingChangeHistory"("productId");
CREATE INDEX "ProductPricingChangeHistory_sku_idx" ON "ProductPricingChangeHistory"("sku");
CREATE INDEX "ProductPricingChangeHistory_changedById_idx" ON "ProductPricingChangeHistory"("changedById");
CREATE INDEX "ProductPricingChangeHistory_createdAt_idx" ON "ProductPricingChangeHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductPricingPolicy" ADD CONSTRAINT "ProductPricingPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPricingPolicy" ADD CONSTRAINT "ProductPricingPolicy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductPricingChangeHistory" ADD CONSTRAINT "ProductPricingChangeHistory_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ProductPricingPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductPricingChangeHistory" ADD CONSTRAINT "ProductPricingChangeHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductPricingChangeHistory" ADD CONSTRAINT "ProductPricingChangeHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
