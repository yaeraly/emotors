-- Branch delivery cost on distribution orders (entered before HQ shipment)

ALTER TABLE "BranchDistributionOrder"
  ADD COLUMN "transportCompany" TEXT,
  ADD COLUMN "transportCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "driverName" TEXT,
  ADD COLUMN "vehicleNumber" TEXT,
  ADD COLUMN "transportNotes" TEXT,
  ADD COLUMN "totalShipmentWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN "deliveryCostEnteredAt" TIMESTAMP(3),
  ADD COLUMN "deliveryCostEnteredById" TEXT;

ALTER TABLE "BranchDistributionOrderItem"
  ADD COLUMN "transportExpenseAllocation" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "transportCostPerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "landedUnitCostKgs" DECIMAL(14,2);

ALTER TABLE "BranchDistributionOrder"
  ADD CONSTRAINT "BranchDistributionOrder_deliveryCostEnteredById_fkey"
  FOREIGN KEY ("deliveryCostEnteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
