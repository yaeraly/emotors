-- Finance investment history records linked to ledger entries
CREATE TYPE "FinanceInvestmentType" AS ENUM ('OWNER_INVESTMENT', 'INVESTOR_INVESTMENT');

CREATE TABLE "FinanceInvestment" (
    "id" TEXT NOT NULL,
    "investmentNumber" TEXT NOT NULL,
    "investmentDate" TIMESTAMP(3) NOT NULL,
    "investmentType" "FinanceInvestmentType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "accountId" TEXT NOT NULL,
    "branchId" TEXT,
    "investorOwnerName" TEXT NOT NULL,
    "providedBy" TEXT NOT NULL,
    "notes" TEXT,
    "ledgerEntryId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceInvestment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceInvestment_investmentNumber_key" ON "FinanceInvestment"("investmentNumber");
CREATE UNIQUE INDEX "FinanceInvestment_ledgerEntryId_key" ON "FinanceInvestment"("ledgerEntryId");
CREATE INDEX "FinanceInvestment_accountId_idx" ON "FinanceInvestment"("accountId");
CREATE INDEX "FinanceInvestment_branchId_idx" ON "FinanceInvestment"("branchId");
CREATE INDEX "FinanceInvestment_investmentType_idx" ON "FinanceInvestment"("investmentType");
CREATE INDEX "FinanceInvestment_investmentDate_idx" ON "FinanceInvestment"("investmentDate");
CREATE INDEX "FinanceInvestment_createdAt_idx" ON "FinanceInvestment"("createdAt");

ALTER TABLE "FinanceInvestment" ADD CONSTRAINT "FinanceInvestment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinanceAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvestment" ADD CONSTRAINT "FinanceInvestment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceInvestment" ADD CONSTRAINT "FinanceInvestment_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "FinanceLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceInvestment" ADD CONSTRAINT "FinanceInvestment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
