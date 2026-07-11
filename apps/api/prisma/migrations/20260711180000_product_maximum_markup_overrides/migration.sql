-- CreateEnum
CREATE TYPE "MaximumMarkupOverrideReasonCode" AS ENUM ('MARKET_PRICE', 'PRODUCT_SPECIFIC_MARGIN', 'COMPETITION', 'SLOW_MOVING_PRODUCT', 'HIGH_DEMAND', 'PROMOTION', 'STRATEGIC_PRODUCT', 'MANAGEMENT_DECISION', 'OTHER');

-- CreateEnum
CREATE TYPE "MaximumMarkupSource" AS ENUM ('INHERITED', 'CEO_PRODUCT_OVERRIDE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "maximumRetailMarkupOverridePercent" DECIMAL(8,2),
ADD COLUMN "retailMaximumOverrideReasonCode" "MaximumMarkupOverrideReasonCode",
ADD COLUMN "retailMaximumOverrideReasonComment" TEXT,
ADD COLUMN "retailMaximumOverriddenById" TEXT,
ADD COLUMN "retailMaximumOverriddenAt" TIMESTAMP(3),
ADD COLUMN "maximumWholesaleMarkupOverridePercent" DECIMAL(8,2),
ADD COLUMN "wholesaleMaximumOverrideReasonCode" "MaximumMarkupOverrideReasonCode",
ADD COLUMN "wholesaleMaximumOverrideReasonComment" TEXT,
ADD COLUMN "wholesaleMaximumOverriddenById" TEXT,
ADD COLUMN "wholesaleMaximumOverriddenAt" TIMESTAMP(3);
