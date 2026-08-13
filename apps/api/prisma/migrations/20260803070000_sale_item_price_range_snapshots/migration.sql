-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "minimumPriceSnapshot" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "recommendedPriceSnapshot" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "maximumPriceSnapshot" DECIMAL(14,2);
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "customerTypeSnapshot" "CustomerType";
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "customerCategorySnapshot" "CustomerLoyaltyCategory";
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "priceChangedManually" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "priceChangedBy" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "priceChangedAt" TIMESTAMP(3);
