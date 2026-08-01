-- AlterEnum CustomerType
ALTER TYPE "CustomerType" ADD VALUE IF NOT EXISTS 'MASTER';

-- CreateEnum CustomerLoyaltyCategory
DO $$ BEGIN
  CREATE TYPE "CustomerLoyaltyCategory" AS ENUM ('STANDARD', 'SILVER', 'GOLD', 'VIP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum LoyaltyPurchaseWindow
DO $$ BEGIN
  CREATE TYPE "LoyaltyPurchaseWindow" AS ENUM ('TOTAL', 'ROLLING_90_DAYS', 'ROLLING_180_DAYS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterEnum PricingEnginePriceType
ALTER TYPE "PricingEnginePriceType" ADD VALUE IF NOT EXISTS 'MASTER_MINIMUM';
ALTER TYPE "PricingEnginePriceType" ADD VALUE IF NOT EXISTS 'MASTER_RECOMMENDED';
ALTER TYPE "PricingEnginePriceType" ADD VALUE IF NOT EXISTS 'MASTER_MAXIMUM';

-- Customer loyalty fields
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "loyaltyCategory" "CustomerLoyaltyCategory" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "purchaseVolume" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastPurchaseAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Customer_loyaltyCategory_idx" ON "Customer"("loyaltyCategory");

-- Product master price tier
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "masterPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "masterMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

-- Seed master markup as midpoint between retail and wholesale when both are set
UPDATE "Product"
SET
  "masterMarkupPercent" = ROUND((("recommendedRetailMarkupPercent" + "wholesaleMarkupPercent") / 2), 2),
  "masterPriceKgs" = ROUND((("recommendedRetailPriceKgs" + "wholesalePriceKgs") / 2), 2)
WHERE "masterMarkupPercent" = 0
  AND "recommendedRetailMarkupPercent" > "wholesaleMarkupPercent";

-- Pricing policy version snapshot master fields
ALTER TABLE "PricingPolicyVersionProductSnapshot" ADD COLUMN IF NOT EXISTS "masterMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE "PricingPolicyVersionProductSnapshot" ADD COLUMN IF NOT EXISTS "masterPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "PricingPolicyVersionProductSnapshot"
SET
  "masterMarkupPercent" = ROUND((("recommendedRetailMarkupPercent" + "wholesaleMarkupPercent") / 2), 2),
  "masterPriceKgs" = ROUND((("recommendedRetailPriceKgs" + "wholesalePriceKgs") / 2), 2)
WHERE "masterMarkupPercent" = 0
  AND "recommendedRetailMarkupPercent" > "wholesaleMarkupPercent";

-- Loyalty program settings singleton
CREATE TABLE IF NOT EXISTS "LoyaltyProgramSettings" (
    "id" TEXT NOT NULL,
    "singletonKey" TEXT NOT NULL DEFAULT 'DEFAULT',
    "purchaseWindow" "LoyaltyPurchaseWindow" NOT NULL DEFAULT 'TOTAL',
    "standardThresholdKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "silverThresholdKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "goldThresholdKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vipThresholdKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "standardDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "silverDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "goldDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "vipDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "allowDowngrade" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyProgramSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyProgramSettings_singletonKey_key" ON "LoyaltyProgramSettings"("singletonKey");
CREATE INDEX IF NOT EXISTS "LoyaltyProgramSettings_updatedById_idx" ON "LoyaltyProgramSettings"("updatedById");

DO $$ BEGIN
  ALTER TABLE "LoyaltyProgramSettings" ADD CONSTRAINT "LoyaltyProgramSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
