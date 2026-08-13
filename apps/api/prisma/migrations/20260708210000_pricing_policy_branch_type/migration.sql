-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('HQ_BRANCH', 'FRANCHISE_BRANCH');

-- AlterTable Branch
ALTER TABLE "Branch"
ADD COLUMN "branchType" "BranchType" NOT NULL DEFAULT 'FRANCHISE_BRANCH',
ADD COLUMN "hqToBranchMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
ADD COLUMN "hqToBranchMarkupUpdatedAt" TIMESTAMP(3);

UPDATE "Branch" SET "branchType" = 'HQ_BRANCH' WHERE "code" = 'EMOTORS-HQ';

-- AlterTable Product
ALTER TABLE "Product"
ADD COLUMN "minimumWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- AlterTable ProductCategory
ALTER TABLE "ProductCategory"
ADD COLUMN "minimumWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- AlterTable ProductPricingChangeHistory
ALTER TABLE "ProductPricingChangeHistory"
ADD COLUMN "branchId" TEXT;

CREATE INDEX "ProductPricingChangeHistory_branchId_idx" ON "ProductPricingChangeHistory"("branchId");

ALTER TABLE "ProductPricingChangeHistory" ADD CONSTRAINT "ProductPricingChangeHistory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
