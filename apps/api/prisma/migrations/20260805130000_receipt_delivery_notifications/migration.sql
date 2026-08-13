-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'RECEIPT_SENT_TO_CREATOR';

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN IF NOT EXISTS "recipientUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Alert_recipientUserId_idx" ON "Alert"("recipientUserId");
