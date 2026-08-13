-- HQ stock booking for branch purchase requests

CREATE TYPE "HqStockBookingStatus" AS ENUM (
  'ACTIVE',
  'CONFIRMED',
  'RELEASED',
  'EXPIRED',
  'CONSUMED'
);

CREATE TYPE "HqStockBookingReleaseReason" AS ENUM (
  'HQ_SALES_REJECTED',
  'HQ_SALES_REMOVED',
  'BRANCH_DECLINED',
  'CANCELLED',
  'EXPIRED',
  'PAYMENT_EXPIRED',
  'INSTALLMENT_REJECTED',
  'PARTIAL_APPROVAL_EXCESS',
  'OTHER'
);

ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_BRANCH_CONFIRMATION';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'BRANCH_CONFIRMED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'BRANCH_DECLINED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_SUBMITTED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_CONFIRMED';
ALTER TYPE "BranchPurchaseRequestStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_HQ_WAREHOUSE';

ALTER TYPE "BranchRequestLineRejectionReason" ADD VALUE IF NOT EXISTS 'INSUFFICIENT_STOCK';
ALTER TYPE "BranchRequestLineRejectionReason" ADD VALUE IF NOT EXISTS 'PRODUCT_INACTIVE';
ALTER TYPE "BranchRequestLineRejectionReason" ADD VALUE IF NOT EXISTS 'PRODUCT_NOT_AVAILABLE_FOR_BRANCH';

ALTER TABLE "BranchPurchaseRequest"
  ADD COLUMN IF NOT EXISTS "bookingExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "branchConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "branchDeclinedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "BranchPurchaseRequest_bookingExpiresAt_idx"
  ON "BranchPurchaseRequest"("bookingExpiresAt");

ALTER TABLE "BranchPurchaseRequestItem"
  ADD COLUMN IF NOT EXISTS "hqPhysicalStock" INTEGER,
  ADD COLUMN IF NOT EXISTS "bookedQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bookingExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedLineTotalKgs" DECIMAL(14,2);

CREATE TABLE "HqStockBooking" (
  "id" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestLineId" TEXT NOT NULL,
  "distributionOrderId" TEXT,
  "bookedQuantity" INTEGER NOT NULL,
  "confirmedQuantity" INTEGER,
  "consumedQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" "HqStockBookingStatus" NOT NULL DEFAULT 'ACTIVE',
  "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "releasedById" TEXT,
  "releaseReason" "HqStockBookingReleaseReason",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HqStockBooking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HqStockBooking_warehouseId_productId_status_idx" ON "HqStockBooking"("warehouseId", "productId", "status");
CREATE INDEX "HqStockBooking_requestId_idx" ON "HqStockBooking"("requestId");
CREATE INDEX "HqStockBooking_requestLineId_idx" ON "HqStockBooking"("requestLineId");
CREATE INDEX "HqStockBooking_status_expiresAt_idx" ON "HqStockBooking"("status", "expiresAt");
CREATE INDEX "HqStockBooking_distributionOrderId_idx" ON "HqStockBooking"("distributionOrderId");
CREATE INDEX "HqStockBooking_branchId_idx" ON "HqStockBooking"("branchId");

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "BranchPurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_requestLineId_fkey"
  FOREIGN KEY ("requestLineId") REFERENCES "BranchPurchaseRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_distributionOrderId_fkey"
  FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HqStockBooking"
  ADD CONSTRAINT "HqStockBooking_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
