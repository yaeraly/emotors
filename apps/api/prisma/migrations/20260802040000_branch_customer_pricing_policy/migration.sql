-- AlterEnum default purchase window semantics for loyalty: rolling 90 days
ALTER TABLE "LoyaltyProgramSettings"
  ALTER COLUMN "purchaseWindow" SET DEFAULT 'ROLLING_90_DAYS';

ALTER TABLE "LoyaltyProgramSettings"
  ALTER COLUMN "silverThresholdKgs" SET DEFAULT 50000,
  ALTER COLUMN "goldThresholdKgs" SET DEFAULT 150000,
  ALTER COLUMN "vipThresholdKgs" SET DEFAULT 300000;

ALTER TABLE "LoyaltyProgramSettings"
  ADD COLUMN IF NOT EXISTS "standardMaxKgs" DECIMAL(14,2) NOT NULL DEFAULT 49999,
  ADD COLUMN IF NOT EXISTS "silverMaxKgs" DECIMAL(14,2) NOT NULL DEFAULT 149999,
  ADD COLUMN IF NOT EXISTS "goldMaxKgs" DECIMAL(14,2) NOT NULL DEFAULT 299999,
  ADD COLUMN IF NOT EXISTS "vipMaxKgs" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "standardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "silverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "goldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS "vipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "minAllowedMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxAllowedMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "branchCustomizationEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "LoyaltyProgramSettings"
SET
  "purchaseWindow" = 'ROLLING_90_DAYS',
  "standardThresholdKgs" = CASE WHEN "standardThresholdKgs" = 0 AND "silverThresholdKgs" = 0 THEN 0 ELSE "standardThresholdKgs" END,
  "silverThresholdKgs" = CASE WHEN "silverThresholdKgs" = 0 THEN 50000 ELSE "silverThresholdKgs" END,
  "goldThresholdKgs" = CASE WHEN "goldThresholdKgs" = 0 THEN 150000 ELSE "goldThresholdKgs" END,
  "vipThresholdKgs" = CASE WHEN "vipThresholdKgs" = 0 THEN 300000 ELSE "vipThresholdKgs" END,
  "standardMaxKgs" = COALESCE("standardMaxKgs", 49999),
  "silverMaxKgs" = COALESCE("silverMaxKgs", 149999),
  "goldMaxKgs" = COALESCE("goldMaxKgs", 299999),
  "standardMarkupPercent" = COALESCE("standardMarkupPercent", 5),
  "silverMarkupPercent" = COALESCE("silverMarkupPercent", 3),
  "goldMarkupPercent" = COALESCE("goldMarkupPercent", 1.5),
  "vipMarkupPercent" = COALESCE("vipMarkupPercent", 0)
WHERE "singletonKey" = 'DEFAULT';

CREATE TABLE IF NOT EXISTS "BranchPricingPolicy" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "standardMinKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "standardMaxKgs" DECIMAL(14,2) NOT NULL DEFAULT 49999,
  "silverMinKgs" DECIMAL(14,2) NOT NULL DEFAULT 50000,
  "silverMaxKgs" DECIMAL(14,2) NOT NULL DEFAULT 149999,
  "goldMinKgs" DECIMAL(14,2) NOT NULL DEFAULT 150000,
  "goldMaxKgs" DECIMAL(14,2) NOT NULL DEFAULT 299999,
  "vipMinKgs" DECIMAL(14,2) NOT NULL DEFAULT 300000,
  "vipMaxKgs" DECIMAL(14,2),
  "standardMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 5,
  "silverMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 3,
  "goldMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 1.5,
  "vipMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchPricingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BranchPricingPolicy_branchId_key" ON "BranchPricingPolicy"("branchId");
CREATE INDEX IF NOT EXISTS "BranchPricingPolicy_branchId_idx" ON "BranchPricingPolicy"("branchId");
CREATE INDEX IF NOT EXISTS "BranchPricingPolicy_updatedById_idx" ON "BranchPricingPolicy"("updatedById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchPricingPolicy_branchId_fkey'
  ) THEN
    ALTER TABLE "BranchPricingPolicy"
      ADD CONSTRAINT "BranchPricingPolicy_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BranchPricingPolicy_updatedById_fkey'
  ) THEN
    ALTER TABLE "BranchPricingPolicy"
      ADD CONSTRAINT "BranchPricingPolicy_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
