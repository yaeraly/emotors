ALTER TABLE "BranchPurchaseRequestItem"
ADD COLUMN IF NOT EXISTS "estimatedLineProductCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
