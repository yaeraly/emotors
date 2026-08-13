-- Normalize legacy inactive accounts to BLOCKED after enum values are committed.
UPDATE "FinanceAccount"
SET "status" = 'BLOCKED'
WHERE "status" = 'INACTIVE' AND "deletedAt" IS NULL;
