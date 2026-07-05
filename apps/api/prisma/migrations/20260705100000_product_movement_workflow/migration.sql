-- Branch distribution order status extensions
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED_BY_SUPPLY_CHAIN';
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'INVOICED';
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_PENDING';
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'SENT_TO_WAREHOUSE';
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'RECEIVED_BY_BRANCH';
ALTER TYPE "BranchDistributionOrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- Shortage report extensions
ALTER TYPE "ShortageReportStatus" ADD VALUE IF NOT EXISTS 'ACKNOWLEDGED';
ALTER TYPE "ShortageReportStatus" ADD VALUE IF NOT EXISTS 'CLOSED';
ALTER TYPE "ShortageReportItemType" ADD VALUE IF NOT EXISTS 'DAMAGED';

-- New enums
CREATE TYPE "HqWarehousePickingTaskStatus" AS ENUM ('ASSIGNED', 'PICKING', 'PACKED', 'SHIPPED', 'CANCELLED');
CREATE TYPE "ShortageResolutionType" AS ENUM ('SEND_IMMEDIATELY', 'ADD_TO_NEXT_ORDER', 'CREDIT_BRANCH', 'CANCEL_WITH_REASON');

-- Alert type extensions
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_ORDER_SUBMITTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_INVOICE_CREATED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'ORDER_SENT_TO_WAREHOUSE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'PICKING_TASK_ASSIGNED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'GOODS_SHIPPED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_GOODS_RECEIVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'DIFFERENCE_ACT_CREATED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SHORTAGE_NEEDS_RESOLUTION';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'REPLACEMENT_GOODS_SHIPPED';

-- Branch invoice: invoice before receiving
ALTER TABLE "BranchInvoice" ALTER COLUMN "goodsReceivingId" DROP NOT NULL;
ALTER TABLE "BranchInvoice" ADD COLUMN IF NOT EXISTS "sentToBranchAt" TIMESTAMP(3);

-- Alert entity linking
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "entityType" TEXT;
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
CREATE INDEX IF NOT EXISTS "Alert_entityType_entityId_idx" ON "Alert"("entityType", "entityId");

-- HQ warehouse picking tasks
CREATE TABLE "HqWarehousePickingTask" (
    "id" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "sourceHqWarehouseId" TEXT NOT NULL,
    "assignedWarehouseManagerId" TEXT,
    "status" "HqWarehousePickingTaskStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqWarehousePickingTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HqWarehousePickingTask_distributionOrderId_key" ON "HqWarehousePickingTask"("distributionOrderId");
CREATE INDEX "HqWarehousePickingTask_sourceHqWarehouseId_idx" ON "HqWarehousePickingTask"("sourceHqWarehouseId");
CREATE INDEX "HqWarehousePickingTask_assignedWarehouseManagerId_idx" ON "HqWarehousePickingTask"("assignedWarehouseManagerId");
CREATE INDEX "HqWarehousePickingTask_status_idx" ON "HqWarehousePickingTask"("status");

ALTER TABLE "HqWarehousePickingTask" ADD CONSTRAINT "HqWarehousePickingTask_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HqWarehousePickingTask" ADD CONSTRAINT "HqWarehousePickingTask_sourceHqWarehouseId_fkey" FOREIGN KEY ("sourceHqWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HqWarehousePickingTask" ADD CONSTRAINT "HqWarehousePickingTask_assignedWarehouseManagerId_fkey" FOREIGN KEY ("assignedWarehouseManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Shortage resolution
CREATE TABLE "ShortageResolution" (
    "id" TEXT NOT NULL,
    "shortageReportId" TEXT NOT NULL,
    "resolutionType" "ShortageResolutionType" NOT NULL,
    "replacementOrderId" TEXT,
    "nextOrderId" TEXT,
    "note" TEXT,
    "resolvedById" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortageResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShortageResolution_shortageReportId_key" ON "ShortageResolution"("shortageReportId");
CREATE INDEX "ShortageResolution_resolvedById_idx" ON "ShortageResolution"("resolvedById");
CREATE INDEX "ShortageResolution_resolutionType_idx" ON "ShortageResolution"("resolutionType");

ALTER TABLE "ShortageResolution" ADD CONSTRAINT "ShortageResolution_shortageReportId_fkey" FOREIGN KEY ("shortageReportId") REFERENCES "ShortageReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShortageResolution" ADD CONSTRAINT "ShortageResolution_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
