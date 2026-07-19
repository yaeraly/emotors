-- Shipment weight snapshots, transport expense invoice category

CREATE TYPE "BranchInvoiceCategory" AS ENUM ('PRODUCT_ORDER', 'TRANSPORT_EXPENSE');

ALTER TABLE "BranchDistributionOrder"
  ADD COLUMN "weightSnapshotAt" TIMESTAMP(3),
  ADD COLUMN "weightFinalizedById" TEXT;

ALTER TABLE "BranchDistributionOrderItem"
  ADD COLUMN "dispatchedQuantity" INTEGER,
  ADD COLUMN "unitWeightKgSnapshot" DECIMAL(14,3),
  ADD COLUMN "lineWeightKgSnapshot" DECIMAL(14,3);

ALTER TABLE "BranchInvoice"
  ADD COLUMN "invoiceCategory" "BranchInvoiceCategory" NOT NULL DEFAULT 'PRODUCT_ORDER';

ALTER TABLE "BranchDistributionOrder"
  ADD CONSTRAINT "BranchDistributionOrder_weightFinalizedById_fkey"
  FOREIGN KEY ("weightFinalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchInvoice" DROP CONSTRAINT IF EXISTS "BranchInvoice_distributionOrderId_key";

CREATE UNIQUE INDEX "BranchInvoice_distributionOrderId_invoiceCategory_key"
  ON "BranchInvoice"("distributionOrderId", "invoiceCategory");

CREATE INDEX "BranchInvoice_distributionOrderId_idx" ON "BranchInvoice"("distributionOrderId");
