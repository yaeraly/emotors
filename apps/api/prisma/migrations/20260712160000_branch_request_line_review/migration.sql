-- Branch product request line-level review, CEO issues, and supply inquiries

CREATE TYPE "BranchPurchaseRequestLineStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED',
  'REMOVED_BY_HQ_SALES'
);

CREATE TYPE "BranchRequestLineRejectionReason" AS ENUM (
  'NO_PRICING_POLICY',
  'OUT_OF_STOCK',
  'OTHER'
);

CREATE TYPE "BranchRequestIssueType" AS ENUM (
  'NO_PRICING_POLICY',
  'OUT_OF_STOCK'
);

CREATE TYPE "BranchRequestIssueStatus" AS ENUM (
  'OPEN',
  'WAITING_FOR_SUPPLY',
  'RESOLVED',
  'CANCELLED'
);

CREATE TYPE "SupplyInquiryStatus" AS ENUM (
  'OPEN',
  'ANSWERED',
  'CLOSED',
  'CANCELLED'
);

CREATE TYPE "SupplyAbsenceReason" AS ENUM (
  'NOT_ORDERED',
  'ORDER_PLANNED',
  'ORDER_IN_PROGRESS',
  'SUPPLIER_DELAY',
  'PRODUCTION_DELAY',
  'TRANSPORT_DELAY',
  'CUSTOMS_DELAY',
  'RECEIVING_IN_PROGRESS',
  'PRODUCT_DISCONTINUED',
  'DEMAND_FORECAST_ERROR',
  'OTHER'
);

ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_REQUEST_NO_PRICING_POLICY';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'BRANCH_REQUEST_OUT_OF_STOCK';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLY_INQUIRY_CREATED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SUPPLY_INQUIRY_RESPONDED';

ALTER TABLE "BranchPurchaseRequestItem"
  ADD COLUMN "lineStatus" "BranchPurchaseRequestLineStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "rejectionReasonCode" "BranchRequestLineRejectionReason",
  ADD COLUMN "publicComment" TEXT,
  ADD COLUMN "unavailableQuantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hasPricingPolicyAtReview" BOOLEAN;

CREATE TABLE "BranchRequestIssue" (
  "id" TEXT NOT NULL,
  "issueType" "BranchRequestIssueType" NOT NULL,
  "status" "BranchRequestIssueStatus" NOT NULL DEFAULT 'OPEN',
  "branchRequestId" TEXT NOT NULL,
  "branchRequestItemId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "availableQuantity" INTEGER NOT NULL DEFAULT 0,
  "unavailableQuantity" INTEGER NOT NULL DEFAULT 0,
  "hqWarehouseId" TEXT,
  "publicComment" TEXT,
  "latestAlertId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),

  CONSTRAINT "BranchRequestIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplyInquiry" (
  "id" TEXT NOT NULL,
  "inquiryNumber" TEXT NOT NULL,
  "status" "SupplyInquiryStatus" NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "message" TEXT NOT NULL,
  "branchRequestId" TEXT NOT NULL,
  "branchRequestItemId" TEXT NOT NULL,
  "branchRequestIssueId" TEXT,
  "productId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "availableQuantity" INTEGER NOT NULL DEFAULT 0,
  "unavailableQuantity" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "respondedById" TEXT,
  "respondedAt" TIMESTAMP(3),
  "absenceReason" "SupplyAbsenceReason",
  "responseComment" TEXT,
  "expectedOrderDate" TIMESTAMP(3),
  "expectedShipmentDate" TIMESTAMP(3),
  "expectedArrivalDate" TIMESTAMP(3),
  "procurementOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplyInquiry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplyInquiry_inquiryNumber_key" ON "SupplyInquiry"("inquiryNumber");
CREATE INDEX "BranchRequestIssue_branchRequestId_idx" ON "BranchRequestIssue"("branchRequestId");
CREATE INDEX "BranchRequestIssue_branchRequestItemId_idx" ON "BranchRequestIssue"("branchRequestItemId");
CREATE INDEX "BranchRequestIssue_productId_idx" ON "BranchRequestIssue"("productId");
CREATE INDEX "BranchRequestIssue_issueType_status_idx" ON "BranchRequestIssue"("issueType", "status");
CREATE INDEX "SupplyInquiry_branchRequestId_idx" ON "SupplyInquiry"("branchRequestId");
CREATE INDEX "SupplyInquiry_branchRequestItemId_idx" ON "SupplyInquiry"("branchRequestItemId");
CREATE INDEX "SupplyInquiry_status_idx" ON "SupplyInquiry"("status");
CREATE INDEX "SupplyInquiry_createdById_idx" ON "SupplyInquiry"("createdById");
CREATE INDEX "BranchPurchaseRequestItem_lineStatus_idx" ON "BranchPurchaseRequestItem"("lineStatus");

ALTER TABLE "BranchRequestIssue"
  ADD CONSTRAINT "BranchRequestIssue_branchRequestId_fkey"
  FOREIGN KEY ("branchRequestId") REFERENCES "BranchPurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchRequestIssue"
  ADD CONSTRAINT "BranchRequestIssue_branchRequestItemId_fkey"
  FOREIGN KEY ("branchRequestItemId") REFERENCES "BranchPurchaseRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchRequestIssue"
  ADD CONSTRAINT "BranchRequestIssue_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchRequestIssue"
  ADD CONSTRAINT "BranchRequestIssue_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_branchRequestId_fkey"
  FOREIGN KEY ("branchRequestId") REFERENCES "BranchPurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_branchRequestItemId_fkey"
  FOREIGN KEY ("branchRequestItemId") REFERENCES "BranchPurchaseRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_branchRequestIssueId_fkey"
  FOREIGN KEY ("branchRequestIssueId") REFERENCES "BranchRequestIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_respondedById_fkey"
  FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SupplyInquiry"
  ADD CONSTRAINT "SupplyInquiry_procurementOrderId_fkey"
  FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
