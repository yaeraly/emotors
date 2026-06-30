-- AlterEnum
ALTER TYPE "ProcurementOrderStatus" ADD VALUE IF NOT EXISTS 'SENT_TO_SUPPLIER';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ProcurementOrderItemStatus" AS ENUM ('ACTIVE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "sentToSupplierAt" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "editableUntil" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "unlockedById" TEXT;
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "unlockedAt" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "unlockExpiresAt" TIMESTAMP(3);
ALTER TABLE "ProcurementOrder" ADD COLUMN IF NOT EXISTS "unlockReason" TEXT;

ALTER TABLE "ProcurementOrderItem" ADD COLUMN IF NOT EXISTS "status" "ProcurementOrderItemStatus" NOT NULL DEFAULT 'ACTIVE';

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ProcurementOrder_unlockedById_idx" ON "ProcurementOrder"("unlockedById");
CREATE INDEX IF NOT EXISTS "ProcurementOrderItem_status_idx" ON "ProcurementOrderItem"("status");
