-- Preserve high-precision CNY settlement amounts (avoid premature 2dp rounding drift).
ALTER TABLE "ProcurementSupplierPayment"
  ALTER COLUMN "amountYuan" TYPE DECIMAL(18,8);

ALTER TABLE "ProcurementOrder"
  ALTER COLUMN "totalPaidYuan" TYPE DECIMAL(18,8),
  ALTER COLUMN "remainingYuan" TYPE DECIMAL(18,8);
