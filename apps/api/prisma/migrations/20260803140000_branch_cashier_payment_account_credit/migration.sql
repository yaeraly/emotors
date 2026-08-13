-- Branch cashier payment account credit fields
ALTER TABLE "BranchPayment" ADD COLUMN "receivedAmount" DECIMAL(14,2);
ALTER TABLE "BranchPayment" ADD COLUMN "changeAmount" DECIMAL(14,2);
ALTER TABLE "BranchPayment" ADD COLUMN "netAcceptedAmount" DECIMAL(14,2);
ALTER TABLE "BranchPayment" ADD COLUMN "financeAccountId" TEXT;
ALTER TABLE "BranchPayment" ADD COLUMN "ledgerEntryId" TEXT;
ALTER TABLE "BranchPayment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "BranchPayment_ledgerEntryId_key" ON "BranchPayment"("ledgerEntryId");
CREATE UNIQUE INDEX "BranchPayment_idempotencyKey_key" ON "BranchPayment"("idempotencyKey");
CREATE INDEX "BranchPayment_financeAccountId_idx" ON "BranchPayment"("financeAccountId");

ALTER TABLE "BranchPayment" ADD CONSTRAINT "BranchPayment_financeAccountId_fkey"
  FOREIGN KEY ("financeAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BranchPayment" ADD CONSTRAINT "BranchPayment_ledgerEntryId_fkey"
  FOREIGN KEY ("ledgerEntryId") REFERENCES "FinanceLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
