-- DropIndex
DROP INDEX "BranchInvoice_distributionOrderId_key";

-- AlterTable
ALTER TABLE "PricingMasterSettings" ALTER COLUMN "updatedAt" DROP DEFAULT;
