-- DropForeignKey
ALTER TABLE "BranchInvoice" DROP CONSTRAINT "BranchInvoice_goodsReceivingId_fkey";

-- DropForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" DROP CONSTRAINT "HqWarehouseManagerAssignment_userId_fkey";

-- DropForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" DROP CONSTRAINT "HqWarehouseManagerAssignment_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "Warehouse" DROP CONSTRAINT "Warehouse_branchId_fkey";

-- AlterTable
ALTER TABLE "ProductPriceOverride" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_pricingPolicyVersionId_idx" ON "BranchDistributionOrder"("pricingPolicyVersionId");

-- CreateIndex
CREATE INDEX "PricingCategoryRule_pricingPolicyVersionId_idx" ON "PricingCategoryRule"("pricingPolicyVersionId");

-- CreateIndex
CREATE INDEX "PricingCategoryRule_pricingProfileId_idx" ON "PricingCategoryRule"("pricingProfileId");

-- CreateIndex
CREATE INDEX "PricingCategoryRule_categoryId_idx" ON "PricingCategoryRule"("categoryId");

-- CreateIndex
CREATE INDEX "PricingCategoryRule_status_idx" ON "PricingCategoryRule"("status");

-- CreateIndex
CREATE INDEX "PricingPolicyVersion_effectiveFrom_idx" ON "PricingPolicyVersion"("effectiveFrom");

-- CreateIndex
CREATE INDEX "PricingPolicyVersion_approvedById_idx" ON "PricingPolicyVersion"("approvedById");

-- CreateIndex
CREATE INDEX "PricingProductRule_pricingPolicyVersionId_idx" ON "PricingProductRule"("pricingPolicyVersionId");

-- CreateIndex
CREATE INDEX "PricingProductRule_pricingProfileId_idx" ON "PricingProductRule"("pricingProfileId");

-- CreateIndex
CREATE INDEX "PricingProductRule_productId_idx" ON "PricingProductRule"("productId");

-- CreateIndex
CREATE INDEX "PricingProductRule_status_idx" ON "PricingProductRule"("status");

-- CreateIndex
CREATE INDEX "PricingSimulation_pricingPolicyVersionId_idx" ON "PricingSimulation"("pricingPolicyVersionId");

-- CreateIndex
CREATE INDEX "PricingSimulation_createdById_idx" ON "PricingSimulation"("createdById");

-- CreateIndex
CREATE INDEX "ProductPriceOverride_pricingPolicyVersionId_idx" ON "ProductPriceOverride"("pricingPolicyVersionId");

-- CreateIndex
CREATE INDEX "SaleItem_pricingPolicyVersionId_idx" ON "SaleItem"("pricingPolicyVersionId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_assignedHqWarehouseId_fkey" FOREIGN KEY ("assignedHqWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" ADD CONSTRAINT "HqWarehouseManagerAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" ADD CONSTRAINT "HqWarehouseManagerAssignment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInvoice" ADD CONSTRAINT "BranchInvoice_goodsReceivingId_fkey" FOREIGN KEY ("goodsReceivingId") REFERENCES "GoodsReceiving"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPurchaseRequest" ADD CONSTRAINT "BranchPurchaseRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPurchaseRequest" ADD CONSTRAINT "BranchPurchaseRequest_assignedHqWarehouseId_fkey" FOREIGN KEY ("assignedHqWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPurchaseRequest" ADD CONSTRAINT "BranchPurchaseRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPurchaseRequest" ADD CONSTRAINT "BranchPurchaseRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "PricingCategoryRule_pricingPolicyVersionId_pricingProfileId_cat" RENAME TO "PricingCategoryRule_pricingPolicyVersionId_pricingProfileId_key";

-- RenameIndex
ALTER INDEX "PricingPolicyVersionCategoryDiscount_versionId_profileId_catego" RENAME TO "PricingPolicyVersionCategoryDiscount_versionId_profileId_ca_key";

-- RenameIndex
ALTER INDEX "PricingProductRule_pricingPolicyVersionId_pricingProfileId_prod" RENAME TO "PricingProductRule_pricingPolicyVersionId_pricingProfileId__key";
