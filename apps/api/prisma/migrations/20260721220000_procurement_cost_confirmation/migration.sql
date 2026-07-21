-- Cost confirmation status is separate from weight-based landedCostStatus.
CREATE TYPE "ProcurementCostConfirmationStatus" AS ENUM (
  'PRELIMINARY',
  'PARTIALLY_CONFIRMED',
  'ACTUAL'
);

ALTER TABLE "ProcurementOrder"
  ADD COLUMN IF NOT EXISTS "costConfirmationStatus" "ProcurementCostConfirmationStatus" NOT NULL DEFAULT 'PRELIMINARY',
  ADD COLUMN IF NOT EXISTS "estimatedSupplierCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "ProcurementOrder_costConfirmationStatus_idx"
  ON "ProcurementOrder"("costConfirmationStatus");
