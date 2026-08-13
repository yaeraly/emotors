-- CreateTable
CREATE TABLE "BranchDistributionReceivingDraftRow" (
    "id" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "distributionOrderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "acceptedQuantity" INTEGER NOT NULL,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "missingQuantity" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "lastSavedAt" TIMESTAMP(3),
    "lastSavedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchDistributionReceivingDraftRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchDistributionReceivingDiscrepancy" (
    "id" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "distributionOrderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "type" "ShortageReportItemType" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "shortageReportItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchDistributionReceivingDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchDistributionReceivingDraftRow_distributionOrderId_distributionOrderItemId_key" ON "BranchDistributionReceivingDraftRow"("distributionOrderId", "distributionOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchDistributionReceivingDraftRow_distributionOrderItemId_key" ON "BranchDistributionReceivingDraftRow"("distributionOrderItemId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDraftRow_distributionOrderId_idx" ON "BranchDistributionReceivingDraftRow"("distributionOrderId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDraftRow_productId_idx" ON "BranchDistributionReceivingDraftRow"("productId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDraftRow_branchId_idx" ON "BranchDistributionReceivingDraftRow"("branchId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDraftRow_lastSavedById_idx" ON "BranchDistributionReceivingDraftRow"("lastSavedById");

-- CreateIndex
CREATE UNIQUE INDEX "BranchDistributionReceivingDiscrepancy_distributionOrderItemId_key" ON "BranchDistributionReceivingDiscrepancy"("distributionOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchDistributionReceivingDiscrepancy_shortageReportItemId_key" ON "BranchDistributionReceivingDiscrepancy"("shortageReportItemId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDiscrepancy_distributionOrderId_idx" ON "BranchDistributionReceivingDiscrepancy"("distributionOrderId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDiscrepancy_productId_idx" ON "BranchDistributionReceivingDiscrepancy"("productId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDiscrepancy_branchId_idx" ON "BranchDistributionReceivingDiscrepancy"("branchId");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDiscrepancy_createdById_idx" ON "BranchDistributionReceivingDiscrepancy"("createdById");

-- CreateIndex
CREATE INDEX "BranchDistributionReceivingDiscrepancy_type_idx" ON "BranchDistributionReceivingDiscrepancy"("type");

-- AddForeignKey
ALTER TABLE "BranchDistributionReceivingDraftRow" ADD CONSTRAINT "BranchDistributionReceivingDraftRow_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionReceivingDraftRow" ADD CONSTRAINT "BranchDistributionReceivingDraftRow_distributionOrderItemId_fkey" FOREIGN KEY ("distributionOrderItemId") REFERENCES "BranchDistributionOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionReceivingDraftRow" ADD CONSTRAINT "BranchDistributionReceivingDraftRow_lastSavedById_fkey" FOREIGN KEY ("lastSavedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionReceivingDiscrepancy" ADD CONSTRAINT "BranchDistributionReceivingDiscrepancy_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionReceivingDiscrepancy" ADD CONSTRAINT "BranchDistributionReceivingDiscrepancy_distributionOrderItemId_fkey" FOREIGN KEY ("distributionOrderItemId") REFERENCES "BranchDistributionOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionReceivingDiscrepancy" ADD CONSTRAINT "BranchDistributionReceivingDiscrepancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
