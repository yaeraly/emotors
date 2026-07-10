-- CreateEnum
CREATE TYPE "BranchPriceProfileType" AS ENUM ('HQ_BRANCH', 'STANDARD_FRANCHISE', 'SILVER_FRANCHISE', 'GOLD_FRANCHISE', 'VIP_FRANCHISE', 'DEALER', 'DISTRIBUTOR');

-- CreateEnum
CREATE TYPE "PricingPolicyVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "BranchPriceProfile" ADD COLUMN "profileType" "BranchPriceProfileType";

UPDATE "BranchPriceProfile" SET "profileType" = 'HQ_BRANCH' WHERE "profileType" IS NULL AND lower("name") LIKE '%hq%branch%';
UPDATE "BranchPriceProfile" SET "profileType" = 'SILVER_FRANCHISE' WHERE "profileType" IS NULL AND lower("name") LIKE '%silver%';
UPDATE "BranchPriceProfile" SET "profileType" = 'GOLD_FRANCHISE' WHERE "profileType" IS NULL AND lower("name") LIKE '%gold%';
UPDATE "BranchPriceProfile" SET "profileType" = 'VIP_FRANCHISE' WHERE "profileType" IS NULL AND lower("name") LIKE '%vip%';
UPDATE "BranchPriceProfile" SET "profileType" = 'DEALER' WHERE "profileType" IS NULL AND lower("name") LIKE '%dealer%';
UPDATE "BranchPriceProfile" SET "profileType" = 'DISTRIBUTOR' WHERE "profileType" IS NULL AND lower("name") LIKE '%distributor%';
UPDATE "BranchPriceProfile" SET "profileType" = 'STANDARD_FRANCHISE' WHERE "profileType" IS NULL;

CREATE TABLE "BranchPriceProfileCategoryDiscount" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "discountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchPriceProfileCategoryDiscount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PricingPolicyVersion" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "PricingPolicyVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingPolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PricingPolicyVersionCategoryDiscount" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileType" "BranchPriceProfileType" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "discountPercent" DECIMAL(8,2) NOT NULL,
    CONSTRAINT "PricingPolicyVersionCategoryDiscount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PricingPolicyVersionProductSnapshot" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "costPriceKgs" DECIMAL(14,2) NOT NULL,
    "hqBranchWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL,
    "wholesaleMarkupPercent" DECIMAL(8,2) NOT NULL,
    "minimumWholesaleMarkupPercent" DECIMAL(8,2) NOT NULL,
    "recommendedRetailMarkupPercent" DECIMAL(8,2) NOT NULL,
    "minimumSellingMarkupPercent" DECIMAL(8,2) NOT NULL,
    "hqBranchWholesalePriceKgs" DECIMAL(14,2) NOT NULL,
    "wholesalePriceKgs" DECIMAL(14,2) NOT NULL,
    "minimumWholesalePriceKgs" DECIMAL(14,2) NOT NULL,
    "recommendedRetailPriceKgs" DECIMAL(14,2) NOT NULL,
    "minimumSellingPriceKgs" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "PricingPolicyVersionProductSnapshot_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_hq_branch', 'HQ Branch', 'HQ_BRANCH', 'HQ_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'HQ_BRANCH');

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_standard', 'Standard Franchise', 'STANDARD_FRANCHISE', 'FRANCHISE_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'STANDARD_FRANCHISE');

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_silver', 'Silver Franchise', 'SILVER_FRANCHISE', 'FRANCHISE_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'SILVER_FRANCHISE');

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_gold', 'Gold Franchise', 'GOLD_FRANCHISE', 'FRANCHISE_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'GOLD_FRANCHISE');

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_vip', 'VIP Franchise', 'VIP_FRANCHISE', 'FRANCHISE_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'VIP_FRANCHISE');

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_dealer', 'Dealer', 'DEALER', 'FRANCHISE_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'DEALER');

INSERT INTO "BranchPriceProfile" ("id", "name", "profileType", "branchType", "defaultHqMarkupPercent", "status", "createdAt", "updatedAt")
SELECT 'bpp_distributor', 'Distributor', 'DISTRIBUTOR', 'FRANCHISE_BRANCH', 0, 'ACTIVE', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "BranchPriceProfile" WHERE "profileType" = 'DISTRIBUTOR');

ALTER TABLE "BranchPriceProfile" ALTER COLUMN "profileType" SET NOT NULL;

CREATE UNIQUE INDEX "BranchPriceProfile_profileType_key" ON "BranchPriceProfile"("profileType");
CREATE INDEX "BranchPriceProfileCategoryDiscount_profileId_idx" ON "BranchPriceProfileCategoryDiscount"("profileId");
CREATE INDEX "BranchPriceProfileCategoryDiscount_categoryId_idx" ON "BranchPriceProfileCategoryDiscount"("categoryId");
CREATE UNIQUE INDEX "BranchPriceProfileCategoryDiscount_profileId_categoryId_key" ON "BranchPriceProfileCategoryDiscount"("profileId", "categoryId");

CREATE UNIQUE INDEX "PricingPolicyVersion_versionNumber_key" ON "PricingPolicyVersion"("versionNumber");
CREATE INDEX "PricingPolicyVersion_status_idx" ON "PricingPolicyVersion"("status");
CREATE INDEX "PricingPolicyVersion_createdById_idx" ON "PricingPolicyVersion"("createdById");
CREATE INDEX "PricingPolicyVersion_publishedById_idx" ON "PricingPolicyVersion"("publishedById");

CREATE INDEX "PricingPolicyVersionCategoryDiscount_versionId_idx" ON "PricingPolicyVersionCategoryDiscount"("versionId");
CREATE UNIQUE INDEX "PricingPolicyVersionCategoryDiscount_versionId_profileId_categoryId_key" ON "PricingPolicyVersionCategoryDiscount"("versionId", "profileId", "categoryId");

CREATE INDEX "PricingPolicyVersionProductSnapshot_versionId_idx" ON "PricingPolicyVersionProductSnapshot"("versionId");
CREATE INDEX "PricingPolicyVersionProductSnapshot_sku_idx" ON "PricingPolicyVersionProductSnapshot"("sku");
CREATE UNIQUE INDEX "PricingPolicyVersionProductSnapshot_versionId_productId_key" ON "PricingPolicyVersionProductSnapshot"("versionId", "productId");

ALTER TABLE "BranchPriceProfileCategoryDiscount" ADD CONSTRAINT "BranchPriceProfileCategoryDiscount_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BranchPriceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchPriceProfileCategoryDiscount" ADD CONSTRAINT "BranchPriceProfileCategoryDiscount_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PricingPolicyVersion" ADD CONSTRAINT "PricingPolicyVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricingPolicyVersion" ADD CONSTRAINT "PricingPolicyVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PricingPolicyVersionCategoryDiscount" ADD CONSTRAINT "PricingPolicyVersionCategoryDiscount_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingPolicyVersionProductSnapshot" ADD CONSTRAINT "PricingPolicyVersionProductSnapshot_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
