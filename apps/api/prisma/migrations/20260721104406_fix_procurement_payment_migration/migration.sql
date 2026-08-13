-- DropIndex (already removed in earlier migrations on fresh DBs)
DROP INDEX IF EXISTS "BranchInvoice_distributionOrderId_key";

-- AlterTable
ALTER TABLE "PricingMasterSettings" ALTER COLUMN "updatedAt" DROP DEFAULT;
