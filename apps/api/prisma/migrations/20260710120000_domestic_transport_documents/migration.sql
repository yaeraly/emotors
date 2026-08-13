-- CreateEnum
CREATE TYPE "DomesticTransportDocumentType" AS ENUM ('RECEIPT', 'INVOICE', 'CARGO_PHOTO', 'DELIVERY_NOTE');

-- AlterEnum
ALTER TYPE "FileAttachmentEntityType" ADD VALUE IF NOT EXISTS 'DOMESTIC_TRANSPORT_ATTACHMENT';

-- AlterTable
ALTER TABLE "ProcurementSvhToHqTransport"
  ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receiptAmountKgs" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FileAttachment"
  ADD COLUMN IF NOT EXISTS "documentType" "DomesticTransportDocumentType",
  ADD COLUMN IF NOT EXISTS "transportCompanyId" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "receiptDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receiptAmountKgs" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "replacedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "replacedById" TEXT;

CREATE INDEX IF NOT EXISTS "FileAttachment_documentType_idx" ON "FileAttachment"("documentType");
CREATE INDEX IF NOT EXISTS "FileAttachment_isCurrent_idx" ON "FileAttachment"("isCurrent");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FileAttachment_replacedById_fkey'
  ) THEN
    ALTER TABLE "FileAttachment"
      ADD CONSTRAINT "FileAttachment_replacedById_fkey"
      FOREIGN KEY ("replacedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
