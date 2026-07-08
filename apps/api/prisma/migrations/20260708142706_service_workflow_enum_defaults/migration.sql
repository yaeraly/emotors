-- Apply DRAFT defaults after enum values are committed (PostgreSQL requirement).

ALTER TABLE "PartsRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "ServiceOrder" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
