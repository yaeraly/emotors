-- HQ warehouses belong to EMOTORS HQ, not to a branch

CREATE TYPE "WarehouseType" AS ENUM ('HQ', 'BRANCH');

ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "warehouseType" "WarehouseType" NOT NULL DEFAULT 'BRANCH';

UPDATE "Warehouse" SET "warehouseType" = 'HQ' WHERE "isHq" = true;

ALTER TABLE "Warehouse" ALTER COLUMN "branchId" DROP NOT NULL;

UPDATE "Warehouse" SET "branchId" = NULL WHERE "warehouseType" = 'HQ';

ALTER TABLE "Warehouse" DROP COLUMN IF EXISTS "isHq";

CREATE INDEX IF NOT EXISTS "Warehouse_warehouseType_idx" ON "Warehouse"("warehouseType");

DROP INDEX IF EXISTS "Warehouse_isHq_idx";
