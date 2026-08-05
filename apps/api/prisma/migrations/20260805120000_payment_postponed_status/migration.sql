-- AlterEnum: allow postponed Supplier / Cargo payment without settling debt
ALTER TYPE "ProcurementSupplierPaymentLedgerStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_POSTPONED';
ALTER TYPE "TransportExpenseStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_POSTPONED';

-- Optional comment when HQ Accountant postpones supplier payment
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "paymentPostponeComment" TEXT;
