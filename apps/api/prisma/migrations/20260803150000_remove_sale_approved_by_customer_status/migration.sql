-- Migrate historical APPROVED_BY_CUSTOMER sales to the correct active status.
UPDATE "Sale" s
SET status = CASE
  WHEN s."finalizedAt" IS NOT NULL THEN 'FINALIZED'::"SaleStatus"
  WHEN s."cancelledAt" IS NOT NULL THEN 'CANCELLED'::"SaleStatus"
  WHEN s."sentToCashierAt" IS NOT NULL THEN 'WAITING_FOR_CASHIER_PAYMENT'::"SaleStatus"
  WHEN s."sentToCustomerAt" IS NOT NULL THEN 'SENT_TO_CUSTOMER'::"SaleStatus"
  WHEN EXISTS (
    SELECT 1
    FROM "SaleInstallmentApproval" sia
    WHERE sia."saleId" = s.id
      AND sia.status IN ('APPROVED', 'ACTIVE', 'PAID')
  ) THEN 'DRAFT'::"SaleStatus"
  ELSE 'DRAFT'::"SaleStatus"
END
WHERE s.status = 'APPROVED_BY_CUSTOMER';

-- Remove obsolete APPROVED_BY_CUSTOMER enum value (PostgreSQL requires enum recreation).
CREATE TYPE "SaleStatus_new" AS ENUM (
  'DRAFT',
  'SENT_TO_CUSTOMER',
  'WAITING_FOR_CASHIER_PAYMENT',
  'FINALIZED',
  'CANCELLED'
);

ALTER TABLE "Sale" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Sale"
  ALTER COLUMN "status" TYPE "SaleStatus_new"
  USING ("status"::text::"SaleStatus_new");
ALTER TABLE "Sale" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "SaleStatus";
ALTER TYPE "SaleStatus_new" RENAME TO "SaleStatus";
