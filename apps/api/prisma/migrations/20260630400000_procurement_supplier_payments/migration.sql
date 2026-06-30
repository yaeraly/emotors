-- CreateEnum
CREATE TYPE "ProcurementSupplierPaymentStatus" AS ENUM ('ACTIVE', 'VOID');
CREATE TYPE "ProcurementSupplierPaymentMethod" AS ENUM ('BANK', 'CASH', 'TRANSFER');
CREATE TYPE "ProcurementSupplierPaymentLedgerStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID');
CREATE TYPE "FileAttachmentEntityType" AS ENUM ('PROCUREMENT_ORDER', 'SUPPLIER_PAYMENT', 'CARGO_RECEIPT');

-- AlterTable
ALTER TABLE "ProcurementOrder" ADD COLUMN "totalPaidYuan" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "totalPaidKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "remainingYuan" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "weightedAverageYuanRate" DECIMAL(14,4);
ALTER TABLE "ProcurementOrder" ADD COLUMN "supplierPaymentStatus" "ProcurementSupplierPaymentLedgerStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE "ProcurementSupplierPayment" (
    "id" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amountYuan" DECIMAL(14,2) NOT NULL,
    "exchangeRate" DECIMAL(14,4) NOT NULL,
    "amountKgs" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "ProcurementSupplierPaymentMethod" NOT NULL,
    "receiptNumber" TEXT,
    "notes" TEXT,
    "status" "ProcurementSupplierPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementSupplierPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcurementCostAdjustment" (
    "id" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "oldTotalCostKgs" DECIMAL(14,2) NOT NULL,
    "newTotalCostKgs" DECIMAL(14,2) NOT NULL,
    "oldWeightedRate" DECIMAL(14,4),
    "newWeightedRate" DECIMAL(14,4),
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcurementCostAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileAttachment" (
    "id" TEXT NOT NULL,
    "entityType" "FileAttachmentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "supplierPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcurementSupplierPayment_procurementOrderId_idx" ON "ProcurementSupplierPayment"("procurementOrderId");
CREATE INDEX "ProcurementSupplierPayment_supplierId_idx" ON "ProcurementSupplierPayment"("supplierId");
CREATE INDEX "ProcurementSupplierPayment_status_idx" ON "ProcurementSupplierPayment"("status");
CREATE INDEX "ProcurementSupplierPayment_createdById_idx" ON "ProcurementSupplierPayment"("createdById");
CREATE INDEX "ProcurementSupplierPayment_paymentDate_idx" ON "ProcurementSupplierPayment"("paymentDate");
CREATE INDEX "ProcurementCostAdjustment_procurementOrderId_idx" ON "ProcurementCostAdjustment"("procurementOrderId");
CREATE INDEX "ProcurementCostAdjustment_createdById_idx" ON "ProcurementCostAdjustment"("createdById");
CREATE INDEX "FileAttachment_entityType_entityId_idx" ON "FileAttachment"("entityType", "entityId");
CREATE INDEX "FileAttachment_uploadedById_idx" ON "FileAttachment"("uploadedById");
CREATE INDEX "FileAttachment_supplierPaymentId_idx" ON "FileAttachment"("supplierPaymentId");

-- AddForeignKey
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcurementSupplierPayment" ADD CONSTRAINT "ProcurementSupplierPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcurementCostAdjustment" ADD CONSTRAINT "ProcurementCostAdjustment_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementCostAdjustment" ADD CONSTRAINT "ProcurementCostAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "ProcurementSupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
