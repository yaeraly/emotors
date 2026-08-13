-- AlterTable
ALTER TABLE "ChinaReceivingDraftRow" ADD COLUMN "productId" TEXT;
ALTER TABLE "ChinaReceivingDraftRow" ADD COLUMN "hqWarehouseId" TEXT;
ALTER TABLE "ChinaReceivingDraftRow" ADD COLUMN "isChecked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChinaReceivingDraftRow" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- Backfill isChecked from isSaved
UPDATE "ChinaReceivingDraftRow" SET "isChecked" = "isSaved" WHERE "isChecked" = false AND "isSaved" = true;

-- CreateIndex
CREATE INDEX "ChinaReceivingDraftRow_productId_idx" ON "ChinaReceivingDraftRow"("productId");
CREATE INDEX "ChinaReceivingDraftRow_hqWarehouseId_idx" ON "ChinaReceivingDraftRow"("hqWarehouseId");
CREATE INDEX "ChinaReceivingDraftRow_isArchived_idx" ON "ChinaReceivingDraftRow"("isArchived");
