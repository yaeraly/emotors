-- CreateTable
CREATE TABLE "ProductCodeMigration" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldCode" TEXT NOT NULL,
    "newCode" TEXT NOT NULL,
    "migrationName" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCodeMigration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCodeMigration_productId_idx" ON "ProductCodeMigration"("productId");

-- CreateIndex
CREATE INDEX "ProductCodeMigration_oldCode_idx" ON "ProductCodeMigration"("oldCode");

-- CreateIndex
CREATE INDEX "ProductCodeMigration_newCode_idx" ON "ProductCodeMigration"("newCode");

-- CreateIndex
CREATE INDEX "ProductCodeMigration_migrationName_idx" ON "ProductCodeMigration"("migrationName");

-- AddForeignKey
ALTER TABLE "ProductCodeMigration" ADD CONSTRAINT "ProductCodeMigration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
