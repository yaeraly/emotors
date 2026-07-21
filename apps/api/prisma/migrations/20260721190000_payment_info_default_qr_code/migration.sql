-- Default supplier payment method is QR Code (Supply Manager workflow).
ALTER TABLE "ProcurementPaymentInfoVersion"
  ALTER COLUMN "paymentMethod" SET DEFAULT 'QR_CODE';
