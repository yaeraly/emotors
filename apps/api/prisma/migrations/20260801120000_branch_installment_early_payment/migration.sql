-- CreateEnum
CREATE TYPE "BranchInstallmentEarlyPaymentType" AS ENUM ('PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "BranchInstallmentEarlyPaymentStatus" AS ENUM (
  'PENDING_BRANCH_CEO_APPROVAL',
  'APPROVED_BY_BRANCH_CEO',
  'REJECTED_BY_BRANCH_CEO',
  'SENT_TO_CASHIER',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'CANCELLED'
);

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_EARLY_PAYMENT_REQUESTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_EARLY_PAYMENT_APPROVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_EARLY_PAYMENT_REJECTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_EARLY_PAYMENT_SENT_TO_CASHIER';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_EARLY_PAYMENT_CONFIRMED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'INSTALLMENT_FULLY_PAID';

-- AlterTable
ALTER TABLE "BranchPayment" ADD COLUMN "earlyPaymentRequestId" TEXT;

-- CreateTable
CREATE TABLE "BranchInstallmentEarlyPaymentRequest" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "installmentId" TEXT NOT NULL,
  "paymentType" "BranchInstallmentEarlyPaymentType" NOT NULL,
  "status" "BranchInstallmentEarlyPaymentStatus" NOT NULL DEFAULT 'PENDING_BRANCH_CEO_APPROVAL',
  "requestedAmount" DECIMAL(14,2) NOT NULL,
  "approvedAmount" DECIMAL(14,2),
  "remainingDebtAtRequest" DECIMAL(14,2) NOT NULL,
  "financeAccountId" TEXT,
  "requestComment" TEXT,
  "rejectionComment" TEXT,
  "requestedById" TEXT NOT NULL,
  "branchCeoApprovedById" TEXT,
  "branchCeoApprovedAt" TIMESTAMP(3),
  "branchCeoRejectedById" TEXT,
  "branchCeoRejectedAt" TIMESTAMP(3),
  "sentToCashierById" TEXT,
  "sentToCashierAt" TIMESTAMP(3),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchInstallmentEarlyPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchInstallmentEarlyPaymentRequest_branchId_idx" ON "BranchInstallmentEarlyPaymentRequest"("branchId");
CREATE INDEX "BranchInstallmentEarlyPaymentRequest_invoiceId_idx" ON "BranchInstallmentEarlyPaymentRequest"("invoiceId");
CREATE INDEX "BranchInstallmentEarlyPaymentRequest_installmentId_idx" ON "BranchInstallmentEarlyPaymentRequest"("installmentId");
CREATE INDEX "BranchInstallmentEarlyPaymentRequest_status_idx" ON "BranchInstallmentEarlyPaymentRequest"("status");
CREATE INDEX "BranchInstallmentEarlyPaymentRequest_requestedById_idx" ON "BranchInstallmentEarlyPaymentRequest"("requestedById");
CREATE INDEX "BranchInstallmentEarlyPaymentRequest_financeAccountId_idx" ON "BranchInstallmentEarlyPaymentRequest"("financeAccountId");
CREATE UNIQUE INDEX "BranchPayment_earlyPaymentRequestId_key" ON "BranchPayment"("earlyPaymentRequestId");
CREATE INDEX "BranchPayment_earlyPaymentRequestId_idx" ON "BranchPayment"("earlyPaymentRequestId");

-- AddForeignKey
ALTER TABLE "BranchPayment" ADD CONSTRAINT "BranchPayment_earlyPaymentRequestId_fkey" FOREIGN KEY ("earlyPaymentRequestId") REFERENCES "BranchInstallmentEarlyPaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BranchInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "BranchOrderInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_financeAccountId_fkey" FOREIGN KEY ("financeAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_branchCeoApprovedById_fkey" FOREIGN KEY ("branchCeoApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_branchCeoRejectedById_fkey" FOREIGN KEY ("branchCeoRejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchInstallmentEarlyPaymentRequest" ADD CONSTRAINT "BranchInstallmentEarlyPaymentRequest_sentToCashierById_fkey" FOREIGN KEY ("sentToCashierById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
