-- AlterTable
ALTER TABLE "ProcurementOrder" ADD COLUMN "previousStatusBeforeCancellation" "ProcurementOrderStatus",
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" TEXT,
ADD COLUMN "cancelReason" TEXT;

-- CreateIndex
CREATE INDEX "ProcurementOrder_cancelledAt_idx" ON "ProcurementOrder"("cancelledAt");

-- CreateIndex
CREATE INDEX "ProcurementOrder_cancelledById_idx" ON "ProcurementOrder"("cancelledById");

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
