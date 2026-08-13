-- Payment information versions, transport expenses, attachment description

ALTER TABLE "FileAttachment" ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE TABLE IF NOT EXISTS "ProcurementPaymentInfoVersion" (
  "id" TEXT NOT NULL,
  "procurementOrderId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "paymentMethod" "ProcurementPaymentInfoMethod" NOT NULL DEFAULT 'BANK_ACCOUNT',
  "bankName" TEXT,
  "accountHolder" TEXT,
  "accountNumber" TEXT,
  "swiftCode" TEXT,
  "bankAddress" TEXT,
  "comment" TEXT,
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProcurementPaymentInfoVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementPaymentInfoVersion_procurementOrderId_versionNumber_key"
  ON "ProcurementPaymentInfoVersion"("procurementOrderId", "versionNumber");
CREATE INDEX IF NOT EXISTS "ProcurementPaymentInfoVersion_procurementOrderId_idx"
  ON "ProcurementPaymentInfoVersion"("procurementOrderId");
CREATE INDEX IF NOT EXISTS "ProcurementPaymentInfoVersion_isActive_idx"
  ON "ProcurementPaymentInfoVersion"("isActive");
CREATE INDEX IF NOT EXISTS "ProcurementPaymentInfoVersion_createdById_idx"
  ON "ProcurementPaymentInfoVersion"("createdById");

DO $$ BEGIN
  ALTER TABLE "ProcurementPaymentInfoVersion"
    ADD CONSTRAINT "ProcurementPaymentInfoVersion_procurementOrderId_fkey"
    FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementPaymentInfoVersion"
    ADD CONSTRAINT "ProcurementPaymentInfoVersion_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ProcurementSupplierPayment" ADD COLUMN IF NOT EXISTS "paymentInfoVersionId" TEXT;
CREATE INDEX IF NOT EXISTS "ProcurementSupplierPayment_paymentInfoVersionId_idx"
  ON "ProcurementSupplierPayment"("paymentInfoVersionId");

DO $$ BEGIN
  ALTER TABLE "ProcurementSupplierPayment"
    ADD CONSTRAINT "ProcurementSupplierPayment_paymentInfoVersionId_fkey"
    FOREIGN KEY ("paymentInfoVersionId") REFERENCES "ProcurementPaymentInfoVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ProcurementTransportExpense" (
  "id" TEXT NOT NULL,
  "expenseNumber" TEXT NOT NULL,
  "procurementOrderId" TEXT,
  "expenseType" "TransportExpenseType" NOT NULL,
  "supplierCarrier" TEXT NOT NULL,
  "transportCompanyId" TEXT,
  "invoiceNumber" TEXT,
  "invoiceDate" TIMESTAMP(3),
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KGS',
  "exchangeRate" DECIMAL(14,4),
  "amountKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3),
  "comment" TEXT,
  "status" "TransportExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "returnReason" TEXT,
  "accountantComment" TEXT,
  "cashierComment" TEXT,
  "transactionNumber" TEXT,
  "financeAccountId" TEXT,
  "ledgerEntryId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "sentToCashierAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "accountantId" TEXT,
  "cashierId" TEXT,
  "returnedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProcurementTransportExpense_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementTransportExpense_expenseNumber_key"
  ON "ProcurementTransportExpense"("expenseNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementTransportExpense_ledgerEntryId_key"
  ON "ProcurementTransportExpense"("ledgerEntryId");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_procurementOrderId_idx"
  ON "ProcurementTransportExpense"("procurementOrderId");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_expenseType_idx"
  ON "ProcurementTransportExpense"("expenseType");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_status_idx"
  ON "ProcurementTransportExpense"("status");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_createdById_idx"
  ON "ProcurementTransportExpense"("createdById");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_accountantId_idx"
  ON "ProcurementTransportExpense"("accountantId");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_cashierId_idx"
  ON "ProcurementTransportExpense"("cashierId");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_financeAccountId_idx"
  ON "ProcurementTransportExpense"("financeAccountId");
CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_dueDate_idx"
  ON "ProcurementTransportExpense"("dueDate");

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_procurementOrderId_fkey"
    FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_transportCompanyId_fkey"
    FOREIGN KEY ("transportCompanyId") REFERENCES "TransportCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_financeAccountId_fkey"
    FOREIGN KEY ("financeAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_ledgerEntryId_fkey"
    FOREIGN KEY ("ledgerEntryId") REFERENCES "FinanceLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_accountantId_fkey"
    FOREIGN KEY ("accountantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_cashierId_fkey"
    FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProcurementTransportExpense"
    ADD CONSTRAINT "ProcurementTransportExpense_returnedById_fkey"
    FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
