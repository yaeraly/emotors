-- CreateEnum
CREATE TYPE "ProcurementItemWeightStatus" AS ENUM ('NOT_SET', 'PRELIMINARY', 'CONFIRMED');
CREATE TYPE "ProcurementLandedCostStatus" AS ENUM ('PENDING_WEIGHT', 'READY_TO_CALCULATE', 'CALCULATED', 'FINALIZED');

-- AlterTable ProcurementOrder
ALTER TABLE "ProcurementOrder" ADD COLUMN "landedCostStatus" "ProcurementLandedCostStatus" NOT NULL DEFAULT 'PENDING_WEIGHT';
ALTER TABLE "ProcurementOrder" ADD COLUMN "landedCostCalculationVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "landedCostCalculatedAt" TIMESTAMP(3);

-- AlterTable ProcurementOrderItem
ALTER TABLE "ProcurementOrderItem" ADD COLUMN "unitWeightKg" DECIMAL(14,3);
ALTER TABLE "ProcurementOrderItem" ADD COLUMN "weightStatus" "ProcurementItemWeightStatus" NOT NULL DEFAULT 'NOT_SET';

-- AlterTable ChinaReceivingDraftRow
ALTER TABLE "ChinaReceivingDraftRow" ADD COLUMN "unitWeightKg" DECIMAL(14,3);
ALTER TABLE "ChinaReceivingDraftRow" ADD COLUMN "weightStatus" "ProcurementItemWeightStatus" NOT NULL DEFAULT 'NOT_SET';

-- Backfill item weights from legacy weightKg
UPDATE "ProcurementOrderItem"
SET
  "unitWeightKg" = CASE WHEN "weightKg" > 0 THEN "weightKg" ELSE NULL END,
  "weightStatus" = CASE WHEN "weightKg" > 0 THEN 'CONFIRMED'::"ProcurementItemWeightStatus" ELSE 'NOT_SET'::"ProcurementItemWeightStatus" END
WHERE "weightStatus" = 'NOT_SET';

-- Backfill order landed cost status
UPDATE "ProcurementOrder"
SET "landedCostStatus" = 'FINALIZED'::"ProcurementLandedCostStatus"
WHERE "hqStockMovementCreatedAt" IS NOT NULL;

UPDATE "ProcurementOrder"
SET "landedCostStatus" = 'CALCULATED'::"ProcurementLandedCostStatus"
WHERE "hqStockMovementCreatedAt" IS NULL
  AND "totalCostKgs" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "ProcurementOrderItem" poi
    WHERE poi."orderId" = "ProcurementOrder"."id"
      AND poi."status" = 'ACTIVE'
      AND poi."weightStatus" = 'NOT_SET'
  );

-- CreateTable
CREATE TABLE "ProcurementLandedCostSnapshot" (
    "id" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "procurementOrderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actualQty" INTEGER NOT NULL DEFAULT 0,
    "unitWeightKg" DECIMAL(14,3),
    "totalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "basePurchaseCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedChinaTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedCargoKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedKyrgyzstanTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedInsuranceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedCustomsKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedTransportExpensesKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedPackagingKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allocatedOtherExpensesKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalLandedCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitLandedCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementLandedCostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementLandedCostSnapshot_procurementOrderItemId_key" ON "ProcurementLandedCostSnapshot"("procurementOrderItemId");
CREATE INDEX "ProcurementLandedCostSnapshot_procurementOrderId_idx" ON "ProcurementLandedCostSnapshot"("procurementOrderId");
CREATE INDEX "ProcurementLandedCostSnapshot_productId_idx" ON "ProcurementLandedCostSnapshot"("productId");
CREATE INDEX "ProcurementLandedCostSnapshot_isFinalized_idx" ON "ProcurementLandedCostSnapshot"("isFinalized");
CREATE INDEX "ProcurementOrderItem_weightStatus_idx" ON "ProcurementOrderItem"("weightStatus");

-- AddForeignKey
ALTER TABLE "ProcurementLandedCostSnapshot" ADD CONSTRAINT "ProcurementLandedCostSnapshot_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcurementLandedCostSnapshot" ADD CONSTRAINT "ProcurementLandedCostSnapshot_procurementOrderItemId_fkey" FOREIGN KEY ("procurementOrderItemId") REFERENCES "ProcurementOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
