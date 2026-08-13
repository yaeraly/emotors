-- Extend HQ cash/bank account lifecycle. Keep existing ACTIVE/INACTIVE rows.
-- Note: do not UPDATE rows to new enum values in this same migration transaction
-- (PostgreSQL forbids using newly added enum values until commit).
ALTER TYPE "FinanceAccountStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "FinanceAccountStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "FinanceAccountStatus" ADD VALUE IF NOT EXISTS 'ARCHIVE_REQUESTED';
ALTER TYPE "FinanceAccountStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
