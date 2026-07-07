-- Branch to HQ warehouse assignment and request routing

ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "assignedHqWarehouseId" TEXT;
CREATE INDEX IF NOT EXISTS "Branch_assignedHqWarehouseId_idx" ON "Branch"("assignedHqWarehouseId");

ALTER TABLE "BranchPurchaseRequest" ADD COLUMN IF NOT EXISTS "assignedHqWarehouseId" TEXT;
CREATE INDEX IF NOT EXISTS "BranchPurchaseRequest_assignedHqWarehouseId_idx" ON "BranchPurchaseRequest"("assignedHqWarehouseId");
