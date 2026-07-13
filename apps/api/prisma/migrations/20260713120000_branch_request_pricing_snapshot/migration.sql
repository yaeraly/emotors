ALTER TABLE "BranchPurchaseRequestItem"
  ADD COLUMN IF NOT EXISTS "pricingPolicyVersionId" TEXT,
  ADD COLUMN IF NOT EXISTS "pricingProfileId" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedBranchPriceKgs" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "appliedRuleType" "PricingAppliedRuleType",
  ADD COLUMN IF NOT EXISTS "appliedRuleId" TEXT,
  ADD COLUMN IF NOT EXISTS "appliedAdjustmentMode" "PricingAdjustmentMode",
  ADD COLUMN IF NOT EXISTS "appliedAdjustmentValue" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "priceResolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hasPricingPolicyAtSubmit" BOOLEAN;

CREATE INDEX IF NOT EXISTS "BranchPurchaseRequestItem_pricingPolicyVersionId_idx"
  ON "BranchPurchaseRequestItem"("pricingPolicyVersionId");
