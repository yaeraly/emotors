-- Set the ProcurementSupplierPayment.status default to DRAFT.
-- Safe only after 20260721103340_init_project (and/or 20260721120000) has added the DRAFT label.

ALTER TABLE "ProcurementSupplierPayment"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';
