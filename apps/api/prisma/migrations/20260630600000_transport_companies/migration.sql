-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('CHINA_DOMESTIC', 'CHINA_EXPORT', 'KYRGYZSTAN_LOCAL', 'UNIVERSAL');

-- CreateEnum
CREATE TYPE "TransportCompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "TransportCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "wechat" TEXT,
    "email" TEXT,
    "address" TEXT,
    "transportType" "TransportType" NOT NULL DEFAULT 'UNIVERSAL',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "notes" TEXT,
    "status" "TransportCompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TransportCompany_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProcurementOrder" ADD COLUMN "chinaDomesticTransportYuan" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "chinaDomesticTransportCompanyId" TEXT;
ALTER TABLE "ProcurementOrder" ADD COLUMN "chinaExportTransportCompanyId" TEXT;
ALTER TABLE "ProcurementOrder" ADD COLUMN "svhToHqTransportCompanyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TransportCompany_companyCode_key" ON "TransportCompany"("companyCode");

-- CreateIndex
CREATE INDEX "TransportCompany_status_idx" ON "TransportCompany"("status");

-- CreateIndex
CREATE INDEX "TransportCompany_transportType_idx" ON "TransportCompany"("transportType");

-- CreateIndex
CREATE INDEX "TransportCompany_createdById_idx" ON "TransportCompany"("createdById");

-- CreateIndex
CREATE INDEX "ProcurementOrder_chinaDomesticTransportCompanyId_idx" ON "ProcurementOrder"("chinaDomesticTransportCompanyId");

-- CreateIndex
CREATE INDEX "ProcurementOrder_chinaExportTransportCompanyId_idx" ON "ProcurementOrder"("chinaExportTransportCompanyId");

-- CreateIndex
CREATE INDEX "ProcurementOrder_svhToHqTransportCompanyId_idx" ON "ProcurementOrder"("svhToHqTransportCompanyId");

-- AddForeignKey
ALTER TABLE "TransportCompany" ADD CONSTRAINT "TransportCompany_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_chinaDomesticTransportCompanyId_fkey" FOREIGN KEY ("chinaDomesticTransportCompanyId") REFERENCES "TransportCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_chinaExportTransportCompanyId_fkey" FOREIGN KEY ("chinaExportTransportCompanyId") REFERENCES "TransportCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_svhToHqTransportCompanyId_fkey" FOREIGN KEY ("svhToHqTransportCompanyId") REFERENCES "TransportCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
