-- Fix PostgreSQL 63-char truncation of
-- "ProcurementPaymentInfoVersion_procurementOrderId_versionNumber_key"
-- → stored as "...versionNumber_".
--
-- Bare ALTER INDEX / DROP INDEX on the truncated name raises P1014:
--   The underlying table for model `...versionNumber_` does not exist.
--
-- Also drop FinanceInvestment.updatedAt DB default (Prisma @updatedAt manages it).

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'ProcurementPaymentInfoVersion_procurementOrderId_versionNumber_'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'ProcurementPaymentInfoVersion_order_ver_key'
  ) THEN
    EXECUTE 'ALTER INDEX public."ProcurementPaymentInfoVersion_procurementOrderId_versionNumber_" RENAME TO "ProcurementPaymentInfoVersion_order_ver_key"';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN duplicate_table THEN
    NULL;
END $$;

-- Prisma's alternate 63-char truncation of the same default name
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'ProcurementPaymentInfoVersion_procurementOrderId_versionNum_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'ProcurementPaymentInfoVersion_order_ver_key'
  ) THEN
    EXECUTE 'ALTER INDEX public."ProcurementPaymentInfoVersion_procurementOrderId_versionNum_key" RENAME TO "ProcurementPaymentInfoVersion_order_ver_key"';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN duplicate_table THEN
    NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ProcurementPaymentInfoVersion_order_ver_key"
  ON "ProcurementPaymentInfoVersion"("procurementOrderId", "versionNumber");

ALTER TABLE "FinanceInvestment" ALTER COLUMN "updatedAt" DROP DEFAULT;
