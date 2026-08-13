-- BranchType enum migration
ALTER TYPE "BranchType" RENAME VALUE 'FRANCHISE_BRANCH' TO 'FRANCHISE';
ALTER TYPE "BranchType" ADD VALUE IF NOT EXISTS 'DEALER';
ALTER TYPE "BranchType" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR';

-- New enums
DO $$ BEGIN
    CREATE TYPE "PricingAdjustmentMode" AS ENUM ('PERCENTAGE_DISCOUNT', 'FIXED_AMOUNT_DISCOUNT', 'FIXED_SELLING_PRICE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
CREATE TYPE "PricingRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "PricingAppliedRuleType" AS ENUM ('TEMP_OVERRIDE', 'PRODUCT_RULE', 'CATEGORY_RULE', 'BASE_FRANCHISE', 'HQ_COST');
CREATE TYPE "PricingChangeReasonCode" AS ENUM ('COST_PRICE_INCREASED', 'COST_PRICE_DECREASED', 'CURRENCY_RATE_CHANGE', 'NEW_SUPPLIER', 'PROMOTION', 'SEASONAL_CHANGE', 'MARKET_ADJUSTMENT', 'COMPETITION', 'MANAGEMENT_DECISION', 'PARTNER_AGREEMENT', 'OTHER');
CREATE TYPE "PricingEnginePriceType" AS ENUM ('BRANCH_PURCHASE', 'RETAIL_MINIMUM', 'RETAIL_RECOMMENDED', 'WHOLESALE_MINIMUM', 'WHOLESALE_RECOMMENDED');

-- ProductPriceOverrideStatus extension
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- PricingPolicyVersionStatus extension
ALTER TYPE "PricingPolicyVersionStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_REVIEW';
ALTER TYPE "PricingPolicyVersionStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "PricingPolicyVersionStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "PricingPolicyVersionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PricingPolicyVersionStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- BranchPriceProfile code
ALTER TABLE "BranchPriceProfile" ADD COLUMN IF NOT EXISTS "code" TEXT;
UPDATE "BranchPriceProfile" SET "code" = "profileType"::text WHERE "code" IS NULL;
ALTER TABLE "BranchPriceProfile" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "BranchPriceProfile_code_key" ON "BranchPriceProfile"("code");

UPDATE "BranchPriceProfile" SET "name" = 'HQ Standard', "code" = 'HQ_STANDARD' WHERE "profileType" = 'HQ_BRANCH';
UPDATE "BranchPriceProfile" SET "name" = 'Dealer Standard', "code" = 'DEALER_STANDARD' WHERE "profileType" = 'DEALER';
UPDATE "BranchPriceProfile" SET "name" = 'Distributor Standard', "code" = 'DISTRIBUTOR_STANDARD' WHERE "profileType" = 'DISTRIBUTOR';

-- PricingPolicyVersion workflow fields
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "changeReason" "PricingChangeReasonCode";
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "changeReasonNote" TEXT;
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "effectiveTimezone" TEXT NOT NULL DEFAULT 'Asia/Bishkek';
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "effectiveUntil" TIMESTAMP(3);
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "scheduledById" TEXT;
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "PricingPolicyVersion" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- ProductPriceOverride modes
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "adjustmentMode" "PricingAdjustmentMode" NOT NULL DEFAULT 'FIXED_SELLING_PRICE';
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "adjustmentValue" DECIMAL(14,2);
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
UPDATE "ProductPriceOverride" SET "adjustmentValue" = "overridePriceKgs" WHERE "adjustmentValue" IS NULL;
ALTER TABLE "ProductPriceOverride" ALTER COLUMN "adjustmentValue" SET NOT NULL;

-- New rule tables
CREATE TABLE IF NOT EXISTS "PricingCategoryRule" (
    "id" TEXT NOT NULL,
    "pricingPolicyVersionId" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "discountPercent" DECIMAL(8,2) NOT NULL,
    "status" "PricingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" "PricingChangeReasonCode",
    "reasonNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingCategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PricingProductRule" (
    "id" TEXT NOT NULL,
    "pricingPolicyVersionId" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "adjustmentMode" "PricingAdjustmentMode" NOT NULL,
    "adjustmentValue" DECIMAL(14,2) NOT NULL,
    "status" "PricingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" "PricingChangeReasonCode",
    "reasonNote" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingProductRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PricingSimulation" (
    "id" TEXT NOT NULL,
    "pricingPolicyVersionId" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "validationErrors" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingSimulation_pkey" PRIMARY KEY ("id")
);

-- Price freeze fields
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "pricingProfileId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "resolvedPriceKgs" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "baseCostKgs" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "baseBranchPriceKgs" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "appliedRuleType" "PricingAppliedRuleType";
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "appliedRuleId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "appliedAdjustmentMode" "PricingAdjustmentMode";
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "appliedAdjustmentValue" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "priceResolvedAt" TIMESTAMP(3);

ALTER TABLE "BranchDistributionOrder" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "pricingProfileId" TEXT;
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "resolvedPriceKgs" DECIMAL(14,2);
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "baseCostKgs" DECIMAL(14,2);
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "baseBranchPriceKgs" DECIMAL(14,2);
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "appliedRuleType" "PricingAppliedRuleType";
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "appliedRuleId" TEXT;
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "appliedAdjustmentMode" "PricingAdjustmentMode";
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "appliedAdjustmentValue" DECIMAL(14,2);
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN IF NOT EXISTS "priceResolvedAt" TIMESTAMP(3);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PricingCategoryRule_pricingPolicyVersionId_pricingProfileId_categoryId_key" ON "PricingCategoryRule"("pricingPolicyVersionId", "pricingProfileId", "categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "PricingProductRule_pricingPolicyVersionId_pricingProfileId_productId_key" ON "PricingProductRule"("pricingPolicyVersionId", "pricingProfileId", "productId");

-- Seed initial active pricing policy version from existing data
INSERT INTO "PricingPolicyVersion" ("id", "versionNumber", "label", "status", "isLocked", "effectiveTimezone", "publishedAt", "createdById", "createdAt", "updatedAt")
SELECT 'ppv_initial_v1', 1, 'Pricing Policy v1', 'ACTIVE', true, 'Asia/Bishkek', NOW(), u."id", NOW(), NOW()
FROM "User" u
WHERE u."role" = 'CEO'
LIMIT 1
ON CONFLICT ("versionNumber") DO NOTHING;

ALTER TABLE "PricingPolicyVersion" ADD CONSTRAINT "PricingPolicyVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricingPolicyVersion" ADD CONSTRAINT "PricingPolicyVersion_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricingCategoryRule" ADD CONSTRAINT "PricingCategoryRule_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingCategoryRule" ADD CONSTRAINT "PricingCategoryRule_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "BranchPriceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingCategoryRule" ADD CONSTRAINT "PricingCategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingProductRule" ADD CONSTRAINT "PricingProductRule_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingProductRule" ADD CONSTRAINT "PricingProductRule_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "BranchPriceProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingProductRule" ADD CONSTRAINT "PricingProductRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingProductRule" ADD CONSTRAINT "PricingProductRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricingSimulation" ADD CONSTRAINT "PricingSimulation_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingSimulation" ADD CONSTRAINT "PricingSimulation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductPriceOverride" ADD CONSTRAINT "ProductPriceOverride_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchDistributionOrder" ADD CONSTRAINT "BranchDistributionOrder_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
