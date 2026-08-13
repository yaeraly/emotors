-- CreateEnum
CREATE TYPE "HqWarehouseAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "HqWarehouseManagerAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "HqWarehouseAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqWarehouseManagerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HqWarehouseManagerAssignment_userId_warehouseId_key" ON "HqWarehouseManagerAssignment"("userId", "warehouseId");

-- CreateIndex
CREATE INDEX "HqWarehouseManagerAssignment_userId_idx" ON "HqWarehouseManagerAssignment"("userId");

-- CreateIndex
CREATE INDEX "HqWarehouseManagerAssignment_warehouseId_idx" ON "HqWarehouseManagerAssignment"("warehouseId");

-- CreateIndex
CREATE INDEX "HqWarehouseManagerAssignment_status_idx" ON "HqWarehouseManagerAssignment"("status");

-- CreateIndex
CREATE INDEX "HqWarehouseManagerAssignment_assignedById_idx" ON "HqWarehouseManagerAssignment"("assignedById");

-- AddForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" ADD CONSTRAINT "HqWarehouseManagerAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" ADD CONSTRAINT "HqWarehouseManagerAssignment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqWarehouseManagerAssignment" ADD CONSTRAINT "HqWarehouseManagerAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
