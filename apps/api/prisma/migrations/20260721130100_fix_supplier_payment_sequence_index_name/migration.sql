-- Align truncated unique index name with Prisma's expected name.
-- Safe on fresh databases: if the old truncated name does not exist, do nothing.
-- Never use bare ALTER INDEX / DROP INDEX on "...sequenceNumber_ke" — that raises:
--   ERROR: relation "...sequenceNumber_ke" does not exist

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'ProcurementSupplierPayment_procurementOrderId_sequenceNumber_ke'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i'
      AND n.nspname = 'public'
      AND c.relname = 'ProcurementSupplierPayment_procurementOrderId_sequenceNumbe_key'
  ) THEN
    EXECUTE 'ALTER INDEX public."ProcurementSupplierPayment_procurementOrderId_sequenceNumber_ke" RENAME TO "ProcurementSupplierPayment_procurementOrderId_sequenceNumbe_key"';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN duplicate_table THEN
    NULL;
END $$;
