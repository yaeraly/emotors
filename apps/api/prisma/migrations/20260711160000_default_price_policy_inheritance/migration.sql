-- Default price policy inheritance
CREATE TYPE "MaximumPricePolicy" AS ENUM ('DISABLED', 'WARNING_ONLY', 'HARD_LIMIT');
CREATE TYPE "MaximumPricePolicySource" AS ENUM ('CATEGORY', 'PRODUCT');

ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "defaultRetailMaximumPolicy" "MaximumPricePolicy" NOT NULL DEFAULT 'DISABLED';
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "defaultWholesaleMaximumPolicy" "MaximumPricePolicy" NOT NULL DEFAULT 'DISABLED';
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "defaultRetailMaximumMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProductCategory" ADD COLUMN IF NOT EXISTS "defaultWholesaleMaximumMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0;

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "retailMaximumPolicySource" "MaximumPricePolicySource" NOT NULL DEFAULT 'CATEGORY';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wholesaleMaximumPolicySource" "MaximumPricePolicySource" NOT NULL DEFAULT 'CATEGORY';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "retailMaximumPolicy" "MaximumPricePolicy" NOT NULL DEFAULT 'DISABLED';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "wholesaleMaximumPolicy" "MaximumPricePolicy" NOT NULL DEFAULT 'DISABLED';

-- Existing explicit maximum settings become product-level overrides.
UPDATE "Product"
SET
  "retailMaximumPolicySource" = 'PRODUCT',
  "retailMaximumPolicy" = CASE
    WHEN "enableMaximumRetailPrice" = true THEN 'HARD_LIMIT'::"MaximumPricePolicy"
    ELSE 'DISABLED'::"MaximumPricePolicy"
  END
WHERE "enableMaximumRetailPrice" = true;

UPDATE "Product"
SET
  "wholesaleMaximumPolicySource" = 'PRODUCT',
  "wholesaleMaximumPolicy" = CASE
    WHEN "enableMaximumWholesalePrice" = true THEN 'HARD_LIMIT'::"MaximumPricePolicy"
    ELSE 'DISABLED'::"MaximumPricePolicy"
  END
WHERE "enableMaximumWholesalePrice" = true;
