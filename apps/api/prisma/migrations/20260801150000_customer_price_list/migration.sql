-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CustomerPriceListShareChannel" AS ENUM ('DOWNLOAD', 'WHATSAPP');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CustomerPriceListShareStatus" AS ENUM ('GENERATED', 'DOWNLOADED', 'WHATSAPP_OPENED', 'SENT', 'SEND_FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerPriceList" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerType" "CustomerType" NOT NULL,
    "loyaltyCategory" "CustomerLoyaltyCategory" NOT NULL DEFAULT 'STANDARD',
    "loyaltyDiscountPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pricingPolicyVersionId" TEXT,
    "title" TEXT NOT NULL,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "fileName" TEXT,
    "filePath" TEXT,
    "fileUrl" TEXT,
    "shareChannel" "CustomerPriceListShareChannel",
    "shareStatus" "CustomerPriceListShareStatus" NOT NULL DEFAULT 'GENERATED',
    "sharedAt" TIMESTAMP(3),
    "snapshotJson" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPriceList_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerPriceList_customerId_idx" ON "CustomerPriceList"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerPriceList_branchId_idx" ON "CustomerPriceList"("branchId");
CREATE INDEX IF NOT EXISTS "CustomerPriceList_generatedById_idx" ON "CustomerPriceList"("generatedById");
CREATE INDEX IF NOT EXISTS "CustomerPriceList_generatedAt_idx" ON "CustomerPriceList"("generatedAt");
CREATE INDEX IF NOT EXISTS "CustomerPriceList_pricingPolicyVersionId_idx" ON "CustomerPriceList"("pricingPolicyVersionId");
CREATE INDEX IF NOT EXISTS "CustomerPriceList_shareStatus_idx" ON "CustomerPriceList"("shareStatus");

DO $$ BEGIN
  ALTER TABLE "CustomerPriceList" ADD CONSTRAINT "CustomerPriceList_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerPriceList" ADD CONSTRAINT "CustomerPriceList_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerPriceList" ADD CONSTRAINT "CustomerPriceList_pricingPolicyVersionId_fkey" FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerPriceList" ADD CONSTRAINT "CustomerPriceList_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
