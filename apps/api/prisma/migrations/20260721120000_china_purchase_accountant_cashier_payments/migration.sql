-- China Purchase payment workflow: Supply Manager → HQ Accountant → HQ Cashier

-- Enum extensions
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

DO $$ BEGIN
  CREATE TYPE "ProcurementKgsAdjustmentReason" AS ENUM (
    'BANK_COMMISSION',
    'PAYMENT_SERVICE_COMMISSION',
    'SUPPLIER_AGREED_CORRECTION',
    'CURRENCY_CONVERSION_DIFFERENCE',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ProcurementOrder invoice handoff fields
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "supplierInvoiceNumber" TEXT;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "expectedPaymentDate" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "invoiceSentToAccountantAt" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "invoiceSentById" TEXT;

-- ProcurementSupplierPayment workflow fields
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "sequenceNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "calculatedAmountKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "approvedAmountKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "actualPaidKgs" DECIMAL(14,2);
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "kgsAdjustmentReason" "ProcurementKgsAdjustmentReason";
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "kgsAdjustmentComment" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "kgsAdjustedById" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "kgsAdjustedAt" TIMESTAMP(3);
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "recipientName" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "recipientCompany" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "beneficiaryName" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "swiftCode" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "cardholderName" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "cardNumberMasked" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "paymentInstructions" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "paymentDeadline" TIMESTAMP(3);
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "intendedFinanceAccountId" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "actualFinanceAccountId" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "accountChangeReason" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "transactionNumber" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "accountantComment" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "cashierComment" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "returnReason" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "actualPaidDifferenceReason" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "sentToCashierAt" TIMESTAMP(3);
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3);
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "returnedById" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "accountantId" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "cashierId" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "ledgerEntryId" TEXT;
ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "reversalOfPaymentId" TEXT;

-- Backfill calculated/approved amounts and sequence numbers for existing payments
UPDATE "ProcurementSupplierPayment"
SET
  "calculatedAmountKgs" = "amountKgs",
  "approvedAmountKgs" = "amountKgs",
  "actualPaidKgs" = CASE WHEN "status"::text = 'ACTIVE' THEN "amountKgs" ELSE "actualPaidKgs" END,
  "paidAt" = CASE WHEN "status"::text = 'ACTIVE' THEN COALESCE("paidAt", "paymentDate", "createdAt") ELSE "paidAt" END,
  "accountantId" = COALESCE("accountantId", "createdById")
WHERE "calculatedAmountKgs" = 0 OR "approvedAmountKgs" = 0 OR "accountantId" IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "procurementOrderId"
      ORDER BY "paymentDate" ASC, "createdAt" ASC, id ASC
    ) AS rn
  FROM "ProcurementSupplierPayment"
)
UPDATE "ProcurementSupplierPayment" p
SET "sequenceNumber" = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ProcurementOrder"
    ADD CONSTRAINT "ProcurementOrder_invoiceSentById_fkey"
    FOREIGN KEY ("invoiceSentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_kgsAdjustedById_fkey"
    FOREIGN KEY ("kgsAdjustedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_intendedFinanceAccountId_fkey"
    FOREIGN KEY ("intendedFinanceAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_actualFinanceAccountId_fkey"
    FOREIGN KEY ("actualFinanceAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_returnedById_fkey"
    FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_accountantId_fkey"
    FOREIGN KEY ("accountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_cashierId_fkey"
    FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_ledgerEntryId_fkey"
    FOREIGN KEY ("ledgerEntryId") REFERENCES "FinanceLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_reversalOfPaymentId_fkey"
    FOREIGN KEY ("reversalOfPaymentId") REFERENCES "ProcurementSupplierPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Indexes and uniqueness
-- Use Prisma's 63-char truncated name directly. Creating the longer
-- "...sequenceNumber_key" name lets PostgreSQL truncate to
-- "...sequenceNumber_ke", which later ALTER INDEX renames can fail to find.
CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementSupplierPayment_procurementOrderId_sequenceNumbe_key"
  ON "ProcurementSupplierPayment"("procurementOrderId", "sequenceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementSupplierPayment_idempotencyKey_key"
  ON "ProcurementSupplierPayment"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementSupplierPayment_ledgerEntryId_key"
  ON "ProcurementSupplierPayment"("ledgerEntryId");

CREATE INDEX IF NOT EXISTS "ProcurementOrder_invoiceSentById_idx" ON "ProcurementOrder"("invoiceSentById");
CREATE INDEX IF NOT EXISTS "ProcurementOrder_invoiceSentToAccountantAt_idx" ON "ProcurementOrder"("invoiceSentToAccountantAt");
CREATE INDEX IF NOT EXISTS "ProcurementOrder_supplierPaymentStatus_idx" ON "ProcurementOrder"("supplierPaymentStatus");
CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_accountantId_idx" ON "ProcurementSupplierPayment"("accountantId");
CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_cashierId_idx" ON "ProcurementSupplierPayment"("cashierId");
CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_intendedFinanceAccountId_idx" ON "ProcurementSupplierPayment"("intendedFinanceAccountId");
CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_actualFinanceAccountId_idx" ON "ProcurementSupplierPayment"("actualFinanceAccountId");
CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_sentToCashierAt_idx" ON "ProcurementSupplierPayment"("sentToCashierAt");
