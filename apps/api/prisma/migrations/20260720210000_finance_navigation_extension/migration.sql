-- CreateEnum
CREATE TYPE "FinanceExpenseStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "FinanceReconciliationStatus" AS ENUM ('PENDING', 'COMPLETED', 'DIFFERENCE', 'REJECTED');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_TRANSFER_PENDING';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_TRANSFER_APPROVED';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_TRANSFER_REJECTED';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_ACCOUNT_ASSIGNED';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_ACCOUNT_UNASSIGNED';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_INVESTMENT_RECORDED';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_SHIFT_DIFFERENCE';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_RECONCILIATION_DIFFERENCE';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_EXPENSE_PENDING';
ALTER TYPE "AlertType" ADD VALUE 'FINANCE_PAYMENT_ACCEPTED';

-- AlterTable
ALTER TABLE "FinanceAccount" ADD COLUMN "iban" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN "swiftBic" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN "posProvider" TEXT;
ALTER TABLE "FinanceAccount" ADD COLUMN "responsibleEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "FinanceAccountAssignment" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FinanceAccountAssignment" ADD COLUMN "allowedOperations" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "FinanceAccountAssignment" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "FinanceAccountAssignment" ADD COLUMN "endDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FinanceExpense" (
    "id" TEXT NOT NULL,
    "expenseNumber" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "payee" TEXT,
    "purpose" TEXT,
    "documentNumber" TEXT,
    "attachmentUrl" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FinanceExpenseStatus" NOT NULL DEFAULT 'PAID',
    "notes" TEXT,
    "ledgerEntryId" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceReconciliation" (
    "id" TEXT NOT NULL,
    "reconciliationNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "branchId" TEXT,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "systemBalance" DECIMAL(14,2) NOT NULL,
    "actualBalance" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "status" "FinanceReconciliationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinanceExpense_expenseNumber_key" ON "FinanceExpense"("expenseNumber");
CREATE INDEX "FinanceExpense_accountId_idx" ON "FinanceExpense"("accountId");
CREATE INDEX "FinanceExpense_branchId_idx" ON "FinanceExpense"("branchId");
CREATE INDEX "FinanceExpense_status_idx" ON "FinanceExpense"("status");
CREATE INDEX "FinanceExpense_expenseDate_idx" ON "FinanceExpense"("expenseDate");
CREATE INDEX "FinanceExpense_category_idx" ON "FinanceExpense"("category");

CREATE UNIQUE INDEX "FinanceReconciliation_reconciliationNumber_key" ON "FinanceReconciliation"("reconciliationNumber");
CREATE INDEX "FinanceReconciliation_accountId_idx" ON "FinanceReconciliation"("accountId");
CREATE INDEX "FinanceReconciliation_branchId_idx" ON "FinanceReconciliation"("branchId");
CREATE INDEX "FinanceReconciliation_status_idx" ON "FinanceReconciliation"("status");
CREATE INDEX "FinanceReconciliation_statementDate_idx" ON "FinanceReconciliation"("statementDate");

-- AddForeignKey
ALTER TABLE "FinanceAccount" ADD CONSTRAINT "FinanceAccount_responsibleEmployeeId_fkey" FOREIGN KEY ("responsibleEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceExpense" ADD CONSTRAINT "FinanceExpense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliation" ADD CONSTRAINT "FinanceReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliation" ADD CONSTRAINT "FinanceReconciliation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceReconciliation" ADD CONSTRAINT "FinanceReconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
