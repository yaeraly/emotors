-- Add ProcurementSupplierPaymentStatus workflow labels immediately after the enum
-- was created as ('ACTIVE', 'VOID') in 20260630400000.
--
-- This must run BEFORE any later migration uses 'DRAFT' as a column default,
-- UPDATE/INSERT value, or cast target. PostgreSQL rejects unknown enum labels
-- with: invalid input value for enum "ProcurementSupplierPaymentStatus": "DRAFT"
--
-- Keep this migration enum-only. Do not set defaults or update rows here:
-- a newly added enum value cannot be used until the migration transaction commits.

ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING_CASHIER';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "ProcurementSupplierPaymentStatus" ADD VALUE IF NOT EXISTS 'REVERSED';
