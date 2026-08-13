ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN "pickedAt" TIMESTAMP(3);
ALTER TABLE "BranchDistributionOrderItem" ADD COLUMN "pickedByUserId" TEXT;

ALTER TABLE "BranchDistributionOrderItem"
  ADD CONSTRAINT "BranchDistributionOrderItem_pickedByUserId_fkey"
  FOREIGN KEY ("pickedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "BranchDistributionOrderItem_pickedByUserId_idx"
  ON "BranchDistributionOrderItem"("pickedByUserId");
