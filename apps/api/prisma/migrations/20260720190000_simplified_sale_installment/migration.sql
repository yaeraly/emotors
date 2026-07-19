-- AlterEnum
ALTER TYPE "SaleInstallmentApprovalStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "SaleInstallmentApprovalStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "SaleInstallmentApprovalStatus" ADD VALUE IF NOT EXISTS 'PAID';

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SALE_INSTALLMENT_PAID';

-- AlterTable
ALTER TABLE "SaleInstallmentApproval" ADD COLUMN IF NOT EXISTS "installmentPaidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "SaleInstallmentApproval" ADD COLUMN IF NOT EXISTS "remainingDebt" DECIMAL(14,2);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SaleInstallmentPayment" (
    "id" TEXT NOT NULL,
    "installmentApprovalId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "paidAfterTotal" DECIMAL(14,2) NOT NULL,
    "remainingAfter" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleInstallmentPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaleInstallmentPayment_installmentApprovalId_idx" ON "SaleInstallmentPayment"("installmentApprovalId");
CREATE INDEX IF NOT EXISTS "SaleInstallmentPayment_branchId_idx" ON "SaleInstallmentPayment"("branchId");
CREATE INDEX IF NOT EXISTS "SaleInstallmentPayment_createdAt_idx" ON "SaleInstallmentPayment"("createdAt");

ALTER TABLE "SaleInstallmentPayment" DROP CONSTRAINT IF EXISTS "SaleInstallmentPayment_installmentApprovalId_fkey";
ALTER TABLE "SaleInstallmentPayment" ADD CONSTRAINT "SaleInstallmentPayment_installmentApprovalId_fkey" FOREIGN KEY ("installmentApprovalId") REFERENCES "SaleInstallmentApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleInstallmentPayment" DROP CONSTRAINT IF EXISTS "SaleInstallmentPayment_branchId_fkey";
ALTER TABLE "SaleInstallmentPayment" ADD CONSTRAINT "SaleInstallmentPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleInstallmentPayment" DROP CONSTRAINT IF EXISTS "SaleInstallmentPayment_createdById_fkey";
ALTER TABLE "SaleInstallmentPayment" ADD CONSTRAINT "SaleInstallmentPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
