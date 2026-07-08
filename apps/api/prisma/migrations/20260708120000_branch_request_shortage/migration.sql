-- Add PARTIALLY_APPROVED to BranchPurchaseRequestStatus
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_APPROVED';

-- CreateEnum
CREATE TYPE "BranchRequestShortageStatus" AS ENUM ('OPEN', 'WAITING_STOCK', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BranchRequestShortage" (
    "id" TEXT NOT NULL,
    "branchRequestId" TEXT NOT NULL,
    "branchRequestItemId" TEXT,
    "branchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "availableQty" INTEGER NOT NULL,
    "approvedQty" INTEGER NOT NULL,
    "missingQty" INTEGER NOT NULL,
    "assignedHqWarehouseId" TEXT NOT NULL,
    "status" "BranchRequestShortageStatus" NOT NULL DEFAULT 'OPEN',
    "procurementOrderId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchRequestShortage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BranchRequestShortage_branchRequestId_idx" ON "BranchRequestShortage"("branchRequestId");
CREATE INDEX "BranchRequestShortage_branchRequestItemId_idx" ON "BranchRequestShortage"("branchRequestItemId");
CREATE INDEX "BranchRequestShortage_branchId_idx" ON "BranchRequestShortage"("branchId");
CREATE INDEX "BranchRequestShortage_productId_idx" ON "BranchRequestShortage"("productId");
CREATE INDEX "BranchRequestShortage_assignedHqWarehouseId_idx" ON "BranchRequestShortage"("assignedHqWarehouseId");
CREATE INDEX "BranchRequestShortage_status_idx" ON "BranchRequestShortage"("status");
CREATE INDEX "BranchRequestShortage_createdAt_idx" ON "BranchRequestShortage"("createdAt");

ALTER TABLE "BranchRequestShortage" ADD CONSTRAINT "BranchRequestShortage_branchRequestId_fkey" FOREIGN KEY ("branchRequestId") REFERENCES "BranchPurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchRequestShortage" ADD CONSTRAINT "BranchRequestShortage_branchRequestItemId_fkey" FOREIGN KEY ("branchRequestItemId") REFERENCES "BranchPurchaseRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchRequestShortage" ADD CONSTRAINT "BranchRequestShortage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchRequestShortage" ADD CONSTRAINT "BranchRequestShortage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchRequestShortage" ADD CONSTRAINT "BranchRequestShortage_assignedHqWarehouseId_fkey" FOREIGN KEY ("assignedHqWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchRequestShortage" ADD CONSTRAINT "BranchRequestShortage_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
