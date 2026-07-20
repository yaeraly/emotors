-- CreateEnum
CREATE TYPE "FinanceAccountScope" AS ENUM ('HQ', 'BRANCH');

-- CreateEnum
CREATE TYPE "FinanceAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FinanceLedgerEntryType" AS ENUM ('OPENING_BALANCE', 'OWNER_INVESTMENT', 'CAPITAL_INJECTION', 'TRANSFER_IN', 'TRANSFER_OUT', 'INCOME', 'EXPENSE', 'PAYMENT', 'REFUND', 'ADJUSTMENT', 'CLOSING_BALANCE');

-- CreateEnum
CREATE TYPE "FinanceTransferStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CashierShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "FinanceAccountTypeDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccountTypeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccount" (
    "id" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "FinanceAccountScope" NOT NULL,
    "branchId" TEXT,
    "typeCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "status" "FinanceAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "qrProvider" TEXT,
    "qrMerchantId" TEXT,
    "posTerminalId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinanceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAccountAssignment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceAccountAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLedgerEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT,
    "entryType" "FinanceLedgerEntryType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "signedAmount" DECIMAL(14,2) NOT NULL,
    "beforeBalance" DECIMAL(14,2) NOT NULL,
    "afterBalance" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "transferId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceTransfer" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "sourceAccountId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "branchId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FinanceTransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashierShift" (
    "id" TEXT NOT NULL,
    "shiftNumber" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" "CashierShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "expectedBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actualBalance" DECIMAL(14,2),
    "closingBalance" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "comments" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);

-- Seed default account types
INSERT INTO "FinanceAccountTypeDefinition" ("id", "code", "name", "category", "isSystem", "isActive", "createdAt", "updatedAt")
VALUES
  ('fat_cash', 'CASH', 'Cash', 'cashbox', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_bank', 'BANK', 'Bank', 'bank', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_qr', 'QR', 'QR', 'qr', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_pos', 'POS', 'POS', 'pos', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_deposit', 'DEPOSIT', 'Deposit', 'bank', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_credit', 'CREDIT_LINE', 'Credit Line', 'bank', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_petty', 'PETTY_CASH', 'Petty Cash', 'cashbox', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_payroll', 'PAYROLL_ACCOUNT', 'Payroll Account', 'bank', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('fat_supplier', 'SUPPLIER_ACCOUNT', 'Supplier Account', 'bank', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountTypeDefinition_code_key" ON "FinanceAccountTypeDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccount_accountNumber_key" ON "FinanceAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "FinanceAccount_branchId_idx" ON "FinanceAccount"("branchId");
CREATE INDEX "FinanceAccount_scope_idx" ON "FinanceAccount"("scope");
CREATE INDEX "FinanceAccount_typeCode_idx" ON "FinanceAccount"("typeCode");
CREATE INDEX "FinanceAccount_status_idx" ON "FinanceAccount"("status");
CREATE INDEX "FinanceAccount_currency_idx" ON "FinanceAccount"("currency");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAccountAssignment_accountId_userId_key" ON "FinanceAccountAssignment"("accountId", "userId");
CREATE INDEX "FinanceAccountAssignment_accountId_idx" ON "FinanceAccountAssignment"("accountId");
CREATE INDEX "FinanceAccountAssignment_userId_idx" ON "FinanceAccountAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceLedgerEntry_entryNumber_key" ON "FinanceLedgerEntry"("entryNumber");
CREATE INDEX "FinanceLedgerEntry_accountId_idx" ON "FinanceLedgerEntry"("accountId");
CREATE INDEX "FinanceLedgerEntry_branchId_idx" ON "FinanceLedgerEntry"("branchId");
CREATE INDEX "FinanceLedgerEntry_entryType_idx" ON "FinanceLedgerEntry"("entryType");
CREATE INDEX "FinanceLedgerEntry_transferId_idx" ON "FinanceLedgerEntry"("transferId");
CREATE INDEX "FinanceLedgerEntry_createdAt_idx" ON "FinanceLedgerEntry"("createdAt");
CREATE INDEX "FinanceLedgerEntry_referenceType_referenceId_idx" ON "FinanceLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceTransfer_transferNumber_key" ON "FinanceTransfer"("transferNumber");
CREATE INDEX "FinanceTransfer_sourceAccountId_idx" ON "FinanceTransfer"("sourceAccountId");
CREATE INDEX "FinanceTransfer_destinationAccountId_idx" ON "FinanceTransfer"("destinationAccountId");
CREATE INDEX "FinanceTransfer_branchId_idx" ON "FinanceTransfer"("branchId");
CREATE INDEX "FinanceTransfer_status_idx" ON "FinanceTransfer"("status");
CREATE INDEX "FinanceTransfer_transferDate_idx" ON "FinanceTransfer"("transferDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashierShift_shiftNumber_key" ON "CashierShift"("shiftNumber");
CREATE INDEX "CashierShift_cashierId_idx" ON "CashierShift"("cashierId");
CREATE INDEX "CashierShift_branchId_idx" ON "CashierShift"("branchId");
CREATE INDEX "CashierShift_accountId_idx" ON "CashierShift"("accountId");
CREATE INDEX "CashierShift_status_idx" ON "CashierShift"("status");
CREATE INDEX "CashierShift_openedAt_idx" ON "CashierShift"("openedAt");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_typeCode_fkey" FOREIGN KEY ("typeCode") REFERENCES "FinanceAccountTypeDefinition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceAccountAssignment" ADD CONSTRAINT "FinanceAccountAssignment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountAssignment" ADD CONSTRAINT "FinanceAccountAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAccountAssignment" ADD CONSTRAINT "FinanceAccountAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceLedgerEntry" ADD CONSTRAINT "FinanceLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerEntry" ADD CONSTRAINT "FinanceLedgerEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerEntry" ADD CONSTRAINT "FinanceLedgerEntry_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "FinanceTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceLedgerEntry" ADD CONSTRAINT "FinanceLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceTransfer" ADD CONSTRAINT "FinanceTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
