-- Supply Manager declares CNY amount to pay when sending payment request to HQ Accountant.
ALTER TABLE "ProcurementOrder"
  ADD COLUMN IF NOT EXISTS "requestedPaymentYuan" DECIMAL(14, 2);
