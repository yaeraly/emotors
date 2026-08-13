-- Branch order payment confirmation, installment, and discrepancy types

CREATE TYPE "BranchPaymentConfirmationStatus" AS ENUM (
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'REJECTED'
);

CREATE TYPE "BranchOrderInstallmentStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

ALTER TYPE "ShortageReportItemType" ADD VALUE IF NOT EXISTS 'WRONG_PRODUCT';
ALTER TYPE "ShortageReportItemType" ADD VALUE IF NOT EXISTS 'INCOMPLETE_PACKAGE';
ALTER TYPE "ShortageReportItemType" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'BRANCH_PAYMENT_RECEIPT';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'BRANCH_RECEIVING';

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_PAYMENT_SUBMITTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_PAYMENT_REJECTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_INSTALLMENT_REQUESTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_INSTALLMENT_APPROVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_INSTALLMENT_REJECTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_ORDER_READY_FOR_WAREHOUSE';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_RECEIVE_DISCREPANCY';

ALTER TABLE "BranchPayment"
  ADD COLUMN IF NOT EXISTS "receiptReference" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmationStatus" "BranchPaymentConfirmationStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionComment" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedById" TEXT;

CREATE INDEX IF NOT EXISTS "BranchPayment_confirmationStatus_idx" ON "BranchPayment"("confirmationStatus");
CREATE INDEX IF NOT EXISTS "BranchPayment_confirmedById_idx" ON "BranchPayment"("confirmedById");
CREATE INDEX IF NOT EXISTS "BranchPayment_rejectedById_idx" ON "BranchPayment"("rejectedById");

ALTER TABLE "BranchPayment"
  ADD CONSTRAINT "BranchPayment_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchPayment"
  ADD CONSTRAINT "BranchPayment_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BranchOrderInstallment" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "branchPurchaseRequestId" TEXT,
  "status" "BranchOrderInstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "firstPaymentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "termMonths" INTEGER NOT NULL DEFAULT 0,
  "firstPaymentRequired" BOOLEAN NOT NULL DEFAULT true,
  "firstPaymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "rejectedById" TEXT,
  "rejectionComment" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BranchOrderInstallment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchOrderInstallment_invoiceId_key" ON "BranchOrderInstallment"("invoiceId");
CREATE INDEX "BranchOrderInstallment_branchId_idx" ON "BranchOrderInstallment"("branchId");
CREATE INDEX "BranchOrderInstallment_branchPurchaseRequestId_idx" ON "BranchOrderInstallment"("branchPurchaseRequestId");
CREATE INDEX "BranchOrderInstallment_status_idx" ON "BranchOrderInstallment"("status");
CREATE INDEX "BranchOrderInstallment_requestedById_idx" ON "BranchOrderInstallment"("requestedById");

ALTER TABLE "BranchOrderInstallment"
  ADD CONSTRAINT "BranchOrderInstallment_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOrderInstallment"
  ADD CONSTRAINT "BranchOrderInstallment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "BranchInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOrderInstallment"
  ADD CONSTRAINT "BranchOrderInstallment_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BranchOrderInstallment"
  ADD CONSTRAINT "BranchOrderInstallment_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchOrderInstallment"
  ADD CONSTRAINT "BranchOrderInstallment_rejectedById_fkey"
  FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_REJECTED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_INSTALLMENT_APPROVAL';
