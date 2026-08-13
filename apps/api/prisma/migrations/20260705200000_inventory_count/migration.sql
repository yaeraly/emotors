-- Stock movement types for inventory count approval
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'INVENTORY_ADJUSTMENT_IN';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'INVENTORY_ADJUSTMENT_OUT';

-- Inventory count enums
CREATE TYPE "InventoryCountType" AS ENUM ('FULL_WAREHOUSE', 'CATEGORY', 'SHELF', 'ZONE', 'PRODUCT');
CREATE TYPE "InventoryCountStatus" AS ENUM ('DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED');

-- Product barcode and balance location fields
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
CREATE INDEX IF NOT EXISTS "Product_barcode_idx" ON "Product"("barcode");

ALTER TABLE "InventoryBalance" ADD COLUMN IF NOT EXISTS "shelf" TEXT;
ALTER TABLE "InventoryBalance" ADD COLUMN IF NOT EXISTS "zone" TEXT;

-- Inventory count sessions
CREATE TABLE "InventoryCountSession" (
    "id" TEXT NOT NULL,
    "sessionNumber" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "inventoryType" "InventoryCountType" NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT,
    "shelf" TEXT,
    "zone" TEXT,
    "filterCategoryId" TEXT,
    "filterShelf" TEXT,
    "filterZone" TEXT,
    "filterBrand" TEXT,
    "filterSupplierId" TEXT,
    "filterProductIds" JSONB,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "rejectedById" TEXT,
    "rejectionReason" TEXT,
    "startDate" TIMESTAMP(3),
    "finishDate" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCountSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryCountSession_sessionNumber_key" ON "InventoryCountSession"("sessionNumber");
CREATE INDEX "InventoryCountSession_warehouseId_idx" ON "InventoryCountSession"("warehouseId");
CREATE INDEX "InventoryCountSession_status_idx" ON "InventoryCountSession"("status");
CREATE INDEX "InventoryCountSession_inventoryType_idx" ON "InventoryCountSession"("inventoryType");
CREATE INDEX "InventoryCountSession_createdById_idx" ON "InventoryCountSession"("createdById");
CREATE INDEX "InventoryCountSession_approvedById_idx" ON "InventoryCountSession"("approvedById");

ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession" ADD CONSTRAINT "InventoryCountSession_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InventoryCountItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "shelf" TEXT,
    "zone" TEXT,
    "systemQuantity" INTEGER NOT NULL,
    "actualQuantity" INTEGER,
    "differenceQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "differenceValueKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remark" TEXT,
    "countedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCountItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryCountItem_sessionId_productId_key" ON "InventoryCountItem"("sessionId", "productId");
CREATE INDEX "InventoryCountItem_sessionId_idx" ON "InventoryCountItem"("sessionId");
CREATE INDEX "InventoryCountItem_productId_idx" ON "InventoryCountItem"("productId");
CREATE INDEX "InventoryCountItem_sku_idx" ON "InventoryCountItem"("sku");

ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountItem" ADD CONSTRAINT "InventoryCountItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
