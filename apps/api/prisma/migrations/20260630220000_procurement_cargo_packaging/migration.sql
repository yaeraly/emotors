-- International cargo and packaging fields for procurement landed cost
ALTER TABLE "ProcurementOrder" ADD COLUMN "defaultUsdRate" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "cargoRateUsdPerKg" DECIMAL(14,4) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "totalCargoCostUsd" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "totalCargoCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "totalNetWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrder" ADD COLUMN "totalPackagingWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;

ALTER TABLE "ProcurementOrderItem" ADD COLUMN "netWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN "packagingWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN "packagingType" TEXT;
ALTER TABLE "ProcurementOrderItem" ADD COLUMN "directPackagingCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "ProcurementOrderItem" SET "netWeightKg" = "weightKg" WHERE "netWeightKg" = 0;
