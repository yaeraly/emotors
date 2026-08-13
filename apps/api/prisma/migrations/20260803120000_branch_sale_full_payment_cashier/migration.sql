-- CreateEnum
CREATE TYPE "SalePaymentType" AS ENUM ('FULL_PAYMENT', 'INSTALLMENT');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'WAITING_FOR_CASHIER';
ALTER TYPE "SaleStatus" ADD VALUE 'WAITING_FOR_CASHIER_PAYMENT';
ALTER TYPE "BranchInvoiceCategory" ADD VALUE 'RETAIL_SALE';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "paymentType" "SalePaymentType",
ADD COLUMN "expectedPaymentAmount" DECIMAL(14,2),
ADD COLUMN "sentToCashierAt" TIMESTAMP(3),
ADD COLUMN "sentToCashierById" TEXT;

-- AlterTable
ALTER TABLE "BranchInvoice" ALTER COLUMN "distributionOrderId" DROP NOT NULL;
ALTER TABLE "BranchInvoice" ADD COLUMN "saleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BranchInvoice_saleId_key" ON "BranchInvoice"("saleId");
CREATE INDEX "Sale_sentToCashierAt_idx" ON "Sale"("sentToCashierAt");
CREATE INDEX "Sale_sentToCashierById_idx" ON "Sale"("sentToCashierById");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sentToCashierById_fkey" FOREIGN KEY ("sentToCashierById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchInvoice" ADD CONSTRAINT "BranchInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
