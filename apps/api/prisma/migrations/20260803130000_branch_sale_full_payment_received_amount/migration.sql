-- AlterTable
ALTER TABLE "Sale"
ADD COLUMN "receivedAmountEnteredBySales" DECIMAL(14,2),
ADD COLUMN "expectedChangeAmount" DECIMAL(14,2);
