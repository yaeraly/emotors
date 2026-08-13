-- CreateEnum
CREATE TYPE "BranchPriceProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "BranchPriceProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchType" "BranchType" NOT NULL DEFAULT 'FRANCHISE_BRANCH',
    "defaultHqMarkupPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "status" "BranchPriceProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchPriceProfile_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "priceProfileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BranchPriceProfile_name_key" ON "BranchPriceProfile"("name");
CREATE INDEX "BranchPriceProfile_createdById_idx" ON "BranchPriceProfile"("createdById");
CREATE INDEX "BranchPriceProfile_status_idx" ON "BranchPriceProfile"("status");
CREATE INDEX "Branch_priceProfileId_idx" ON "Branch"("priceProfileId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_priceProfileId_fkey" FOREIGN KEY ("priceProfileId") REFERENCES "BranchPriceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BranchPriceProfile" ADD CONSTRAINT "BranchPriceProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
