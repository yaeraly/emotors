-- Branch product request workflow: extended statuses and transport/cost fields

ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED_TO_HQ';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'REVIEWED_BY_HQ_SALES';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'SENT_TO_HQ_WAREHOUSE';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'SHIPPED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'RECEIVED_WITH_DIFFERENCE';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "branchWarehouseId" TEXT;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "transportCompany" TEXT;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "transportCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "driverName" TEXT;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "vehicleNumber" TEXT;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "dispatchDate" TIMESTAMP(3);
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "transportNotes" TEXT;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "totalQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "totalEstimatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "BranchPurchaseRequest_branchWarehouseId_idx" ON "BranchPurchaseRequest"("branchWarehouseId");

ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "approvedQuantity" INTEGER;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'pcs';
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "currentBranchStock" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "hqAvailableStock" INTEGER;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "wholesalePriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "transportExpenseAllocation" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "estimatedUnitCost" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "BranchPurchaseRequestItem" ADD COLUMN IF NOT EXISTS "weightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
