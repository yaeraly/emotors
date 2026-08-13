-- Supplier payment info default: Банковский счёт
ALTER TABLE "ProcurementPaymentInfoVersion"
  ALTER COLUMN "paymentMethod" SET DEFAULT 'BANK_ACCOUNT';

-- Section payable / transport expense payment method + bank / QR support fields
ALTER TABLE "ProcurementTransportExpense"
  ADD COLUMN IF NOT EXISTS "requestType" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseName" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "recipientName" TEXT,
  ADD COLUMN IF NOT EXISTS "route" TEXT,
  ADD COLUMN IF NOT EXISTS "vehicleInfo" TEXT,
  ADD COLUMN IF NOT EXISTS "shipmentReference" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentMethod" "ProcurementPaymentInfoMethod" NOT NULL DEFAULT 'QR_CODE',
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "accountHolder" TEXT,
  ADD COLUMN IF NOT EXISTS "accountNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "swiftCode" TEXT;

CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_requestType_idx"
  ON "ProcurementTransportExpense"("requestType");

CREATE INDEX IF NOT EXISTS "ProcurementTransportExpense_paymentMethod_idx"
  ON "ProcurementTransportExpense"("paymentMethod");
