-- PostgreSQL truncates identifiers to 63 chars. Align the unique index name with Prisma's expected truncated name.
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
    ALTER INDEX "ProcurementSupplierPayment_procurementOrderId_sequenceNumber_ke"
      RENAME TO "ProcurementSupplierPayment_procurementOrderId_sequenceNumbe_key";
  END IF;
END $$;
