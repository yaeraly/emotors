-- CreateEnum
CREATE TYPE "SvhToHqTransportStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ProcurementSvhToHqTransport" (
    "id" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "transportCompanyId" TEXT,
    "transportCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "dispatchDate" TIMESTAMP(3),
    "arrivalDate" TIMESTAMP(3),
    "status" "SvhToHqTransportStatus" NOT NULL DEFAULT 'WAITING',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementSvhToHqTransport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementSvhToHqTransport_procurementOrderId_key" ON "ProcurementSvhToHqTransport"("procurementOrderId");

-- CreateIndex
CREATE INDEX "ProcurementSvhToHqTransport_transportCompanyId_idx" ON "ProcurementSvhToHqTransport"("transportCompanyId");

-- CreateIndex
CREATE INDEX "ProcurementSvhToHqTransport_status_idx" ON "ProcurementSvhToHqTransport"("status");

-- CreateIndex
CREATE INDEX "ProcurementSvhToHqTransport_createdById_idx" ON "ProcurementSvhToHqTransport"("createdById");

-- AddForeignKey
ALTER TABLE "ProcurementSvhToHqTransport" ADD CONSTRAINT "ProcurementSvhToHqTransport_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSvhToHqTransport" ADD CONSTRAINT "ProcurementSvhToHqTransport_transportCompanyId_fkey" FOREIGN KEY ("transportCompanyId") REFERENCES "TransportCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementSvhToHqTransport" ADD CONSTRAINT "ProcurementSvhToHqTransport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate existing SVH transport data from procurement orders
INSERT INTO "ProcurementSvhToHqTransport" (
    "id",
    "procurementOrderId",
    "transportCompanyId",
    "transportCostKgs",
    "status",
    "createdById",
    "createdAt",
    "updatedAt"
)
SELECT
    md5(random()::text || clock_timestamp()::text || po."id"),
    po."id",
    po."svhToHqTransportCompanyId",
    po."localTransportKgs",
    CASE
        WHEN po."hqStockMovementCreatedAt" IS NOT NULL THEN 'COMPLETED'::"SvhToHqTransportStatus"
        WHEN po."localTransportKgs" > 0 OR po."svhToHqTransportCompanyId" IS NOT NULL THEN 'IN_PROGRESS'::"SvhToHqTransportStatus"
        ELSE 'WAITING'::"SvhToHqTransportStatus"
    END,
    po."createdById",
    po."createdAt",
    po."updatedAt"
FROM "ProcurementOrder" po
WHERE po."deletedAt" IS NULL
  AND (
    po."localTransportKgs" > 0
    OR po."svhToHqTransportCompanyId" IS NOT NULL
    OR po."status" IN ('ARRIVED_IN_KYRGYZSTAN', 'ARRIVED', 'CUSTOMS_CLEARANCE', 'IN_TRANSIT')
  );
