-- CreateEnum
CREATE TYPE "SaleInstallmentApprovalStatus" AS ENUM ('DRAFT', 'PENDING_BRANCH_CEO_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SALE_INSTALLMENT_REQUESTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SALE_INSTALLMENT_APPROVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SALE_INSTALLMENT_REJECTED';

-- CreateTable
CREATE TABLE "SaleInstallmentApproval" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "status" "SaleInstallmentApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "requestVersion" INTEGER NOT NULL DEFAULT 1,
    "termsSnapshot" JSONB NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "initialPayment" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "financedAmount" DECIMAL(14,2) NOT NULL,
    "installmentDays" INTEGER,
    "dueDate" TIMESTAMP(3),
    "paymentCount" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleInstallmentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleInstallmentApproval_saleId_key" ON "SaleInstallmentApproval"("saleId");
CREATE UNIQUE INDEX "SaleInstallmentApproval_requestNumber_key" ON "SaleInstallmentApproval"("requestNumber");
CREATE INDEX "SaleInstallmentApproval_branchId_idx" ON "SaleInstallmentApproval"("branchId");
CREATE INDEX "SaleInstallmentApproval_status_idx" ON "SaleInstallmentApproval"("status");
CREATE INDEX "SaleInstallmentApproval_submittedAt_idx" ON "SaleInstallmentApproval"("submittedAt");

-- AddForeignKey
ALTER TABLE "SaleInstallmentApproval" ADD CONSTRAINT "SaleInstallmentApproval_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleInstallmentApproval" ADD CONSTRAINT "SaleInstallmentApproval_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleInstallmentApproval" ADD CONSTRAINT "SaleInstallmentApproval_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleInstallmentApproval" ADD CONSTRAINT "SaleInstallmentApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleInstallmentApproval" ADD CONSTRAINT "SaleInstallmentApproval_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
