-- Customer classification for HQ Branch vs HQ Sales ownership
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'WHOLESALE', 'DEALER', 'DISTRIBUTOR', 'FRANCHISE');

ALTER TABLE "Customer" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'RETAIL';
ALTER TABLE "Customer" ADD COLUMN "companyName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "taxId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "region" TEXT;
ALTER TABLE "Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "Customer" ADD COLUMN "creditLimit" DECIMAL(14,2);
ALTER TABLE "Customer" ADD COLUMN "additionalPhone" TEXT;
ALTER TABLE "Customer" ADD COLUMN "convertedToBranchId" TEXT;

CREATE UNIQUE INDEX "Customer_convertedToBranchId_key" ON "Customer"("convertedToBranchId");
CREATE INDEX "Customer_customerType_idx" ON "Customer"("customerType");
CREATE INDEX "Customer_branchId_customerType_idx" ON "Customer"("branchId", "customerType");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_convertedToBranchId_fkey"
  FOREIGN KEY ("convertedToBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HQ Sales B2B sales (Dealer / Distributor customers)
CREATE TYPE "HqB2bSaleStatus" AS ENUM (
  'DRAFT',
  'AWAITING_PAYMENT_CONFIRMATION',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'AWAITING_CEO_APPROVAL',
  'CEO_REJECTED',
  'SENT_TO_WAREHOUSE',
  'RESERVED',
  'PICKING',
  'PACKED',
  'READY_FOR_SHIPMENT',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "HqB2bPaymentType" AS ENUM ('FULL_PAYMENT', 'INSTALLMENT');

CREATE TYPE "HqB2bPaymentRequestStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CORRECTION_REQUESTED'
);

CREATE TYPE "HqB2bInstallmentStatus" AS ENUM (
  'AWAITING_CEO_APPROVAL',
  'CEO_APPROVED',
  'CEO_REJECTED',
  'AWAITING_DOWN_PAYMENT_CONFIRMATION',
  'DOWN_PAYMENT_CONFIRMED',
  'ACTIVE',
  'OVERDUE',
  'PAID',
  'CANCELLED'
);

CREATE TABLE "HqB2bSale" (
  "id" TEXT NOT NULL,
  "saleNumber" TEXT NOT NULL,
  "hqBranchId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "customerType" "CustomerType" NOT NULL,
  "customerNameSnapshot" TEXT NOT NULL,
  "customerPhoneSnapshot" TEXT,
  "customerCompanySnapshot" TEXT,
  "paymentType" "HqB2bPaymentType" NOT NULL,
  "status" "HqB2bSaleStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "pricingPolicyVersionId" TEXT,
  "createdById" TEXT NOT NULL,
  "responsibleUserId" TEXT NOT NULL,
  "notes" TEXT,
  "submittedAt" TIMESTAMP(3),
  "sentToWarehouseAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HqB2bSale_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HqB2bSale_saleNumber_key" ON "HqB2bSale"("saleNumber");
CREATE INDEX "HqB2bSale_hqBranchId_idx" ON "HqB2bSale"("hqBranchId");
CREATE INDEX "HqB2bSale_customerId_idx" ON "HqB2bSale"("customerId");
CREATE INDEX "HqB2bSale_status_idx" ON "HqB2bSale"("status");
CREATE INDEX "HqB2bSale_createdById_idx" ON "HqB2bSale"("createdById");
CREATE INDEX "HqB2bSale_responsibleUserId_idx" ON "HqB2bSale"("responsibleUserId");
CREATE INDEX "HqB2bSale_createdAt_idx" ON "HqB2bSale"("createdAt");

ALTER TABLE "HqB2bSale" ADD CONSTRAINT "HqB2bSale_hqBranchId_fkey"
  FOREIGN KEY ("hqBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HqB2bSale" ADD CONSTRAINT "HqB2bSale_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HqB2bSale" ADD CONSTRAINT "HqB2bSale_pricingPolicyVersionId_fkey"
  FOREIGN KEY ("pricingPolicyVersionId") REFERENCES "PricingPolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HqB2bSale" ADD CONSTRAINT "HqB2bSale_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HqB2bSale" ADD CONSTRAINT "HqB2bSale_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HqB2bSaleItem" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "skuSnapshot" TEXT NOT NULL,
  "categoryNameSnapshot" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "lineTotal" DECIMAL(14,2) NOT NULL,
  "costPriceSnapshot" DECIMAL(14,2),
  "basePriceSnapshot" DECIMAL(14,2),
  "pricingPolicyVersionId" TEXT,
  "pricingProfileId" TEXT,
  "pricingSource" TEXT,
  "appliedRuleType" "PricingAppliedRuleType",
  "appliedRuleId" TEXT,
  "priceResolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HqB2bSaleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HqB2bSaleItem_saleId_idx" ON "HqB2bSaleItem"("saleId");
CREATE INDEX "HqB2bSaleItem_productId_idx" ON "HqB2bSaleItem"("productId");

ALTER TABLE "HqB2bSaleItem" ADD CONSTRAINT "HqB2bSaleItem_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "HqB2bSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HqB2bSaleItem" ADD CONSTRAINT "HqB2bSaleItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "HqB2bPaymentRequest" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "status" "HqB2bPaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
  "expectedAmount" DECIMAL(14,2) NOT NULL,
  "receivedAmount" DECIMAL(14,2),
  "paymentMethod" "PaymentMethod",
  "financeAccountId" TEXT,
  "transactionReference" TEXT,
  "receiptDocumentUrl" TEXT,
  "paymentDate" TIMESTAMP(3),
  "comment" TEXT,
  "rejectionReason" TEXT,
  "submittedById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HqB2bPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HqB2bPaymentRequest_saleId_idx" ON "HqB2bPaymentRequest"("saleId");
CREATE INDEX "HqB2bPaymentRequest_status_idx" ON "HqB2bPaymentRequest"("status");

ALTER TABLE "HqB2bPaymentRequest" ADD CONSTRAINT "HqB2bPaymentRequest_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "HqB2bSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HqB2bPaymentRequest" ADD CONSTRAINT "HqB2bPaymentRequest_financeAccountId_fkey"
  FOREIGN KEY ("financeAccountId") REFERENCES "FinanceAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HqB2bPaymentRequest" ADD CONSTRAINT "HqB2bPaymentRequest_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HqB2bPaymentRequest" ADD CONSTRAINT "HqB2bPaymentRequest_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HqB2bInstallmentAgreement" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "status" "HqB2bInstallmentStatus" NOT NULL DEFAULT 'AWAITING_CEO_APPROVAL',
  "saleTotal" DECIMAL(14,2) NOT NULL,
  "downPayment" DECIMAL(14,2) NOT NULL,
  "remainingBalance" DECIMAL(14,2) NOT NULL,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "installmentStartDate" TIMESTAMP(3) NOT NULL,
  "paymentFrequency" TEXT NOT NULL,
  "numberOfPayments" INTEGER NOT NULL,
  "scheduleJson" JSONB NOT NULL,
  "nextPaymentDate" TIMESTAMP(3),
  "overdueAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "ceoApprovedById" TEXT,
  "ceoApprovedAt" TIMESTAMP(3),
  "ceoRejectedById" TEXT,
  "ceoRejectedAt" TIMESTAMP(3),
  "ceoRejectionReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HqB2bInstallmentAgreement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HqB2bInstallmentAgreement_saleId_key" ON "HqB2bInstallmentAgreement"("saleId");

ALTER TABLE "HqB2bInstallmentAgreement" ADD CONSTRAINT "HqB2bInstallmentAgreement_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "HqB2bSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HqB2bInstallmentAgreement" ADD CONSTRAINT "HqB2bInstallmentAgreement_ceoApprovedById_fkey"
  FOREIGN KEY ("ceoApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HqB2bInstallmentAgreement" ADD CONSTRAINT "HqB2bInstallmentAgreement_ceoRejectedById_fkey"
  FOREIGN KEY ("ceoRejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Alert types for HQ B2B workflow
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_SALE_SUBMITTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_PAYMENT_CONFIRMED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_PAYMENT_REJECTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_INSTALLMENT_CEO_APPROVED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_INSTALLMENT_CEO_REJECTED';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_SALE_WAREHOUSE_READY';
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'HQ_B2B_PAYMENT_CORRECTION_REQUESTED';
