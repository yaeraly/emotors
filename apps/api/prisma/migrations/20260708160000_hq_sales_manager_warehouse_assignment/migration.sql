-- CreateTable
CREATE TABLE "HqSalesManagerWarehouseAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "HqWarehouseAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqSalesManagerWarehouseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HqSalesManagerWarehouseAssignment_userId_warehouseId_key" ON "HqSalesManagerWarehouseAssignment"("userId", "warehouseId");

-- CreateIndex
CREATE INDEX "HqSalesManagerWarehouseAssignment_userId_idx" ON "HqSalesManagerWarehouseAssignment"("userId");

-- CreateIndex
CREATE INDEX "HqSalesManagerWarehouseAssignment_warehouseId_idx" ON "HqSalesManagerWarehouseAssignment"("warehouseId");

-- CreateIndex
CREATE INDEX "HqSalesManagerWarehouseAssignment_status_idx" ON "HqSalesManagerWarehouseAssignment"("status");

-- CreateIndex
CREATE INDEX "HqSalesManagerWarehouseAssignment_assignedById_idx" ON "HqSalesManagerWarehouseAssignment"("assignedById");

-- AddForeignKey
ALTER TABLE "HqSalesManagerWarehouseAssignment" ADD CONSTRAINT "HqSalesManagerWarehouseAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqSalesManagerWarehouseAssignment" ADD CONSTRAINT "HqSalesManagerWarehouseAssignment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqSalesManagerWarehouseAssignment" ADD CONSTRAINT "HqSalesManagerWarehouseAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
