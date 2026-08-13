-- Branch Master service workflow extensions

CREATE TYPE "ServicePhotoType" AS ENUM ('BEFORE', 'AFTER', 'DAMAGED_PART');

ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "vehicle" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "licensePlate" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "mileage" INTEGER;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "complaint" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "repairDescription" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "warrantyDays" INTEGER;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "oldPartReturned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "customerSignature" TEXT;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "checklistDiagnostics" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "checklistPartsInstalled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "checklistTestDrive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "checklistFinalInspection" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "checklistCustomerInformed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "readyForPaymentAt" TIMESTAMP(3);
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

ALTER TABLE "PartsRequestItem" ADD COLUMN IF NOT EXISTS "issuedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PartsRequestItem" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(14,2);
ALTER TABLE "PartsRequestItem" ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "PartsRequestItem" DROP CONSTRAINT IF EXISTS "PartsRequestItem_requestId_fkey";
ALTER TABLE "PartsRequestItem" ADD CONSTRAINT "PartsRequestItem_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "PartsRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartsRequest" DROP CONSTRAINT IF EXISTS "PartsRequest_serviceOrderId_fkey";
ALTER TABLE "PartsRequest" ADD CONSTRAINT "PartsRequest_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ServiceOrderPhoto" (
  "id" TEXT NOT NULL,
  "serviceOrderId" TEXT NOT NULL,
  "type" "ServicePhotoType" NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceOrderPayment" (
  "id" TEXT NOT NULL,
  "serviceOrderId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ServiceOrderPhoto_serviceOrderId_idx" ON "ServiceOrderPhoto"("serviceOrderId");
CREATE INDEX IF NOT EXISTS "ServiceOrderPhoto_uploadedById_idx" ON "ServiceOrderPhoto"("uploadedById");
CREATE INDEX IF NOT EXISTS "ServiceOrderPayment_serviceOrderId_idx" ON "ServiceOrderPayment"("serviceOrderId");
CREATE INDEX IF NOT EXISTS "ServiceOrderPayment_branchId_idx" ON "ServiceOrderPayment"("branchId");
CREATE INDEX IF NOT EXISTS "ServiceOrderPayment_customerId_idx" ON "ServiceOrderPayment"("customerId");
CREATE INDEX IF NOT EXISTS "ServiceOrderPayment_createdById_idx" ON "ServiceOrderPayment"("createdById");
CREATE INDEX IF NOT EXISTS "ServiceOrderPayment_paidAt_idx" ON "ServiceOrderPayment"("paidAt");

ALTER TABLE "ServiceOrderPhoto" DROP CONSTRAINT IF EXISTS "ServiceOrderPhoto_serviceOrderId_fkey";
ALTER TABLE "ServiceOrderPhoto" ADD CONSTRAINT "ServiceOrderPhoto_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderPhoto" DROP CONSTRAINT IF EXISTS "ServiceOrderPhoto_uploadedById_fkey";
ALTER TABLE "ServiceOrderPhoto" ADD CONSTRAINT "ServiceOrderPhoto_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderPayment" DROP CONSTRAINT IF EXISTS "ServiceOrderPayment_serviceOrderId_fkey";
ALTER TABLE "ServiceOrderPayment" ADD CONSTRAINT "ServiceOrderPayment_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderPayment" DROP CONSTRAINT IF EXISTS "ServiceOrderPayment_branchId_fkey";
ALTER TABLE "ServiceOrderPayment" ADD CONSTRAINT "ServiceOrderPayment_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderPayment" DROP CONSTRAINT IF EXISTS "ServiceOrderPayment_customerId_fkey";
ALTER TABLE "ServiceOrderPayment" ADD CONSTRAINT "ServiceOrderPayment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceOrderPayment" DROP CONSTRAINT IF EXISTS "ServiceOrderPayment_createdById_fkey";
ALTER TABLE "ServiceOrderPayment" ADD CONSTRAINT "ServiceOrderPayment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
