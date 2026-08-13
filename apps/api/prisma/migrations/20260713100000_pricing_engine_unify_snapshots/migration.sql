-- AlterEnum: add PRICING_PROFILE to PricingAppliedRuleType
DO $$ BEGIN
  ALTER TYPE "PricingAppliedRuleType" ADD VALUE 'PRICING_PROFILE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- PartsConsumption pricing freeze snapshot
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "pricingProfileId" TEXT;
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "resolvedPriceKgs" DECIMAL(14,2);
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "baseCostKgs" DECIMAL(14,2);
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "baseBranchPriceKgs" DECIMAL(14,2);
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "appliedRuleType" "PricingAppliedRuleType";
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "appliedRuleId" TEXT;
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "appliedAdjustmentMode" "PricingAdjustmentMode";
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "appliedAdjustmentValue" DECIMAL(14,2);
ALTER TABLE "PartsConsumption" ADD COLUMN IF NOT EXISTS "priceResolvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PartsConsumption_pricingPolicyVersionId_idx" ON "PartsConsumption"("pricingPolicyVersionId");

-- ReturnOrderItem pricing freeze snapshot
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT;
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "pricingProfileId" TEXT;
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "resolvedPriceKgs" DECIMAL(14,2);
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "baseCostKgs" DECIMAL(14,2);
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "baseBranchPriceKgs" DECIMAL(14,2);
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "appliedRuleType" "PricingAppliedRuleType";
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "appliedRuleId" TEXT;
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "appliedAdjustmentMode" "PricingAdjustmentMode";
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "appliedAdjustmentValue" DECIMAL(14,2);
ALTER TABLE "ReturnOrderItem" ADD COLUMN IF NOT EXISTS "priceResolvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ReturnOrderItem_pricingPolicyVersionId_idx" ON "ReturnOrderItem"("pricingPolicyVersionId");
