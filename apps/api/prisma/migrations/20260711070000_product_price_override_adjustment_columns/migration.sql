-- ProductPriceOverride adjustment columns must exist before any later drift/fix migrations.
-- Keeps shadow-database replay compatible with auto-generated fix_project migrations.

DO $$ BEGIN
    CREATE TYPE "PricingAdjustmentMode" AS ENUM (
        'PERCENTAGE_DISCOUNT',
        'FIXED_AMOUNT_DISCOUNT',
        'FIXED_SELLING_PRICE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ProductPriceOverrideStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "adjustmentMode" "PricingAdjustmentMode" NOT NULL DEFAULT 'FIXED_SELLING_PRICE';
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "adjustmentValue" DECIMAL(14,2);
ALTER TABLE "ProductPriceOverride" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

UPDATE "ProductPriceOverride"
SET "adjustmentValue" = "overridePriceKgs"
WHERE "adjustmentValue" IS NULL;

ALTER TABLE "ProductPriceOverride"
ALTER COLUMN "adjustmentValue" SET NOT NULL;
