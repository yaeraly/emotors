-- CreateEnum
CREATE TYPE "BranchHqReturnStatus" AS ENUM (
  'DRAFT',
  'PENDING_BRANCH_APPROVAL',
  'BRANCH_APPROVED',
  'READY_TO_SHIP',
  'PICKING',
  'PACKED',
  'SHIPPED_TO_HQ',
  'RECEIVED_AT_HQ',
  'HQ_ACCEPTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'DISCREPANCY'
);

-- CreateEnum
CREATE TYPE "BranchHqReturnReason" AS ENUM (
  'SURPLUS',
  'ORDER_ERROR',
  'DEFECT',
  'MALFUNCTION',
  'EXCHANGE',
  'HQ_DECISION',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "BranchHqReturnCondition" AS ENUM (
  'NEW',
  'USED',
  'DEFECTIVE',
  'DAMAGED'
);

-- CreateEnum
CREATE TYPE "BranchHqReturnFinancialAdjustmentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'NOT_REQUIRED'
);

-- CreateTable
CREATE TABLE "BranchHqReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "status" "BranchHqReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalLineCount" INTEGER NOT NULL DEFAULT 0,
    "totalReturnValueKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "inTransitQuantity" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "rejectionReason" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "shippedById" TEXT,
    "shippedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchHqReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchHqReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "availableAtCreate" INTEGER NOT NULL DEFAULT 0,
    "reason" "BranchHqReturnReason" NOT NULL,
    "condition" "BranchHqReturnCondition" NOT NULL DEFAULT 'NEW',
    "comment" TEXT,
    "unitCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineReturnValueKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shippedQuantity" INTEGER NOT NULL DEFAULT 0,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "differenceQuantity" INTEGER NOT NULL DEFAULT 0,
    "inTransitQuantity" INTEGER NOT NULL DEFAULT 0,
    "hqCondition" "BranchHqReturnCondition",
    "hqReceivingNote" TEXT,
    "pickedAt" TIMESTAMP(3),
    "pickedByUserId" TEXT,
    "sourceDistributionOrderId" TEXT,
    "sourceDistributionOrderItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchHqReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchHqReturnFifoAllocation" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "fifoBatchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostKgs" DECIMAL(14,2) NOT NULL,
    "totalCostKgs" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "sourceReferenceType" TEXT,
    "sourceReferenceId" TEXT,
    "hqFifoBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchHqReturnFifoAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchHqReturnDiscrepancy" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "returnItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "comment" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchHqReturnDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchHqReturnFinancialAdjustment" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "BranchHqReturnFinancialAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedReturnValueKgs" DECIMAL(14,2) NOT NULL,
    "currentDebtKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "suggestedCreditKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "appliedCreditKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "resultingDebtKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remainingCreditKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchHqReturnFinancialAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchHqReturn_returnNumber_key" ON "BranchHqReturn"("returnNumber");
CREATE INDEX "BranchHqReturn_branchId_idx" ON "BranchHqReturn"("branchId");
CREATE INDEX "BranchHqReturn_sourceWarehouseId_idx" ON "BranchHqReturn"("sourceWarehouseId");
CREATE INDEX "BranchHqReturn_destinationWarehouseId_idx" ON "BranchHqReturn"("destinationWarehouseId");
CREATE INDEX "BranchHqReturn_status_idx" ON "BranchHqReturn"("status");
CREATE INDEX "BranchHqReturn_createdById_idx" ON "BranchHqReturn"("createdById");
CREATE INDEX "BranchHqReturn_createdAt_idx" ON "BranchHqReturn"("createdAt");

CREATE INDEX "BranchHqReturnItem_returnId_idx" ON "BranchHqReturnItem"("returnId");
CREATE INDEX "BranchHqReturnItem_productId_idx" ON "BranchHqReturnItem"("productId");
CREATE INDEX "BranchHqReturnItem_pickedByUserId_idx" ON "BranchHqReturnItem"("pickedByUserId");

CREATE INDEX "BranchHqReturnFifoAllocation_returnId_idx" ON "BranchHqReturnFifoAllocation"("returnId");
CREATE INDEX "BranchHqReturnFifoAllocation_returnItemId_idx" ON "BranchHqReturnFifoAllocation"("returnItemId");
CREATE INDEX "BranchHqReturnFifoAllocation_fifoBatchId_idx" ON "BranchHqReturnFifoAllocation"("fifoBatchId");
CREATE INDEX "BranchHqReturnFifoAllocation_productId_idx" ON "BranchHqReturnFifoAllocation"("productId");
CREATE INDEX "BranchHqReturnFifoAllocation_status_idx" ON "BranchHqReturnFifoAllocation"("status");

CREATE UNIQUE INDEX "BranchHqReturnDiscrepancy_returnItemId_key" ON "BranchHqReturnDiscrepancy"("returnItemId");
CREATE INDEX "BranchHqReturnDiscrepancy_returnId_idx" ON "BranchHqReturnDiscrepancy"("returnId");
CREATE INDEX "BranchHqReturnDiscrepancy_productId_idx" ON "BranchHqReturnDiscrepancy"("productId");
CREATE INDEX "BranchHqReturnDiscrepancy_createdById_idx" ON "BranchHqReturnDiscrepancy"("createdById");

CREATE UNIQUE INDEX "BranchHqReturnFinancialAdjustment_returnId_key" ON "BranchHqReturnFinancialAdjustment"("returnId");
CREATE INDEX "BranchHqReturnFinancialAdjustment_branchId_idx" ON "BranchHqReturnFinancialAdjustment"("branchId");
CREATE INDEX "BranchHqReturnFinancialAdjustment_status_idx" ON "BranchHqReturnFinancialAdjustment"("status");
CREATE INDEX "BranchHqReturnFinancialAdjustment_decidedById_idx" ON "BranchHqReturnFinancialAdjustment"("decidedById");

-- AddForeignKey
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_shippedById_fkey" FOREIGN KEY ("shippedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturn" ADD CONSTRAINT "BranchHqReturn_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchHqReturnItem" ADD CONSTRAINT "BranchHqReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "BranchHqReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturnItem" ADD CONSTRAINT "BranchHqReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturnItem" ADD CONSTRAINT "BranchHqReturnItem_pickedByUserId_fkey" FOREIGN KEY ("pickedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchHqReturnFifoAllocation" ADD CONSTRAINT "BranchHqReturnFifoAllocation_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "BranchHqReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturnFifoAllocation" ADD CONSTRAINT "BranchHqReturnFifoAllocation_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "BranchHqReturnItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturnFifoAllocation" ADD CONSTRAINT "BranchHqReturnFifoAllocation_fifoBatchId_fkey" FOREIGN KEY ("fifoBatchId") REFERENCES "FifoInventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchHqReturnDiscrepancy" ADD CONSTRAINT "BranchHqReturnDiscrepancy_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "BranchHqReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturnDiscrepancy" ADD CONSTRAINT "BranchHqReturnDiscrepancy_returnItemId_fkey" FOREIGN KEY ("returnItemId") REFERENCES "BranchHqReturnItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchHqReturnFinancialAdjustment" ADD CONSTRAINT "BranchHqReturnFinancialAdjustment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "BranchHqReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchHqReturnFinancialAdjustment" ADD CONSTRAINT "BranchHqReturnFinancialAdjustment_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
