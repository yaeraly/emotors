-- Add China Purchase payment workflow enum values BEFORE any migration uses them.
-- PostgreSQL requires each new enum label to exist (and typically be committed)
-- before it can be used as a column default, cast target, or UPDATE value.
--
-- This migration intentionally contains ONLY ALTER TYPE ... ADD VALUE statements.
-- Column defaults / data updates that reference these labels belong in later migrations.

ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING_CASHIER';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'REVERSED';

ALTER TYPE "ProcurementSupplierPaymentMethod" ADD VALUE IF NOT EXISTS 'QR_CODE';
ALTER TYPE "ProcurementSupplierPaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_ACCOUNT';
ALTER TYPE "ProcurementSupplierPaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_CARD';
ALTER TYPE "ProcurementSupplierPaymentMethod" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TYPE "ProcurementSupplierPaymentLedgerStatus" ADD VALUE IF NOT EXISTS 'AWAITING_ACCOUNTANT';
ALTER TYPE "ProcurementSupplierPaymentLedgerStatus" ADD VALUE IF NOT EXISTS 'AWAITING_CASHIER';

ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'SUPPLIER_INVOICE';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'PAYMENT_QR';
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'PAYMENT_BANK_DETAILS';

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLIER_INVOICE_SENT_TO_ACCOUNTANT';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_SENT_TO_CASHIER';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_RETURNED_TO_ACCOUNTANT';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_PARTIALLY_PAID';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_OVERPAYMENT_ATTEMPT';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLIER_PAYMENT_REVERSAL_REQUESTED';
