-- CreateTable
CREATE TABLE "ChinaReceivingDraftRow" (
    "id" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "procurementItemId" TEXT NOT NULL,
    "actualQuantity" INTEGER NOT NULL,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "lastSavedAt" TIMESTAMP(3),
    "lastSavedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChinaReceivingDraftRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChinaReceivingEditSession" (
    "id" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "lockedByUserId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChinaReceivingEditSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChinaReceivingDraftRow_procurementOrderId_idx" ON "ChinaReceivingDraftRow"("procurementOrderId");

-- CreateIndex
CREATE INDEX "ChinaReceivingDraftRow_procurementItemId_idx" ON "ChinaReceivingDraftRow"("procurementItemId");

-- CreateIndex
CREATE INDEX "ChinaReceivingDraftRow_lastSavedById_idx" ON "ChinaReceivingDraftRow"("lastSavedById");

-- CreateIndex
CREATE UNIQUE INDEX "ChinaReceivingDraftRow_procurementOrderId_procurementItemId_key" ON "ChinaReceivingDraftRow"("procurementOrderId", "procurementItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ChinaReceivingEditSession_procurementOrderId_key" ON "ChinaReceivingEditSession"("procurementOrderId");

-- CreateIndex
CREATE INDEX "ChinaReceivingEditSession_lockedByUserId_idx" ON "ChinaReceivingEditSession"("lockedByUserId");

-- AddForeignKey
ALTER TABLE "ChinaReceivingDraftRow" ADD CONSTRAINT "ChinaReceivingDraftRow_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceivingDraftRow" ADD CONSTRAINT "ChinaReceivingDraftRow_lastSavedById_fkey" FOREIGN KEY ("lastSavedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceivingEditSession" ADD CONSTRAINT "ChinaReceivingEditSession_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChinaReceivingEditSession" ADD CONSTRAINT "ChinaReceivingEditSession_lockedByUserId_fkey" FOREIGN KEY ("lockedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
