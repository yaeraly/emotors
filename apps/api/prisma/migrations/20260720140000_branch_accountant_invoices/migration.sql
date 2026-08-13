-- Branch Accountant invoice payment type and installment metadata
CREATE TYPE "BranchInvoicePaymentType" AS ENUM ('FULL_PAYMENT', 'INSTALLMENT');

ALTER TABLE "BranchInvoice" ADD COLUMN IF NOT EXISTS "paymentType" "BranchInvoicePaymentType";

ALTER TABLE "BranchOrderInstallment" ADD COLUMN IF NOT EXISTS "requestComment" TEXT;
ALTER TABLE "BranchOrderInstallment" ADD COLUMN IF NOT EXISTS "installmentDueDate" TIMESTAMP(3);
