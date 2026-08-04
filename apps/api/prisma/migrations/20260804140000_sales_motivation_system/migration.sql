-- Sales Motivation System for Branch CEO
CREATE TYPE "SalesMotivationBonusType" AS ENUM ('FIXED', 'PERCENT');
CREATE TYPE "FullPaymentBonusTrigger" AS ENUM ('AFTER_CASHIER_PAYMENT_CONFIRMATION', 'AFTER_INVOICE_CLOSED');
CREATE TYPE "InstallmentBonusTrigger" AS ENUM ('AFTER_BRANCH_CEO_APPROVAL', 'AFTER_FIRST_PAYMENT', 'AFTER_FULL_REPAYMENT');
CREATE TYPE "SalesBonusStatus" AS ENUM ('ACCRUED', 'PENDING', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "SalesBonusKind" AS ENUM (
  'FULL_PAYMENT_COMMISSION',
  'INSTALLMENT_APPROVAL_COMMISSION',
  'INSTALLMENT_REPAYMENT_COMMISSION',
  'MONTHLY_PLAN',
  'AVERAGE_RECEIPT',
  'RETURNING_CUSTOMER'
);

CREATE TABLE "SalesMotivationSettingsVersion" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "comment" TEXT,
  "createdById" TEXT NOT NULL,
  "fullPaymentCommissionPercent" DECIMAL(8,4) NOT NULL,
  "fullPaymentMinCommission" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "fullPaymentMaxCommission" DECIMAL(14,2),
  "fullPaymentEffectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fullPaymentTrigger" "FullPaymentBonusTrigger" NOT NULL DEFAULT 'AFTER_CASHIER_PAYMENT_CONFIRMATION',
  "installmentApprovalCommissionPercent" DECIMAL(8,4) NOT NULL,
  "installmentRepaymentCommissionPercent" DECIMAL(8,4) NOT NULL,
  "installmentEffectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "installmentTrigger" "InstallmentBonusTrigger" NOT NULL DEFAULT 'AFTER_FULL_REPAYMENT',
  "returningCustomerDays" INTEGER NOT NULL DEFAULT 30,
  "returningCustomerBonusType" "SalesMotivationBonusType" NOT NULL DEFAULT 'FIXED',
  "returningCustomerFixedAmount" DECIMAL(14,2),
  "returningCustomerPercent" DECIMAL(8,4),
  "averageReceiptMinCount" INTEGER NOT NULL DEFAULT 30,
  "recommendationSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesMotivationSettingsVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesMotivationPlanLevel" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "salesThreshold" DECIMAL(14,2) NOT NULL,
  "bonusAmount" DECIMAL(14,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SalesMotivationPlanLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesMotivationAverageReceiptLevel" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "averageReceiptThreshold" DECIMAL(14,2) NOT NULL,
  "bonusAmount" DECIMAL(14,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SalesMotivationAverageReceiptLevel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesBonusAccrual" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "saleId" TEXT,
  "kind" "SalesBonusKind" NOT NULL,
  "saleAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "commissionPercent" DECIMAL(8,4),
  "commissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "SalesBonusStatus" NOT NULL DEFAULT 'ACCRUED',
  "comment" TEXT,
  "saleDate" TIMESTAMP(3),
  "paymentType" TEXT,
  "customerId" TEXT,
  "customerName" TEXT,
  "receiptNumber" TEXT,
  "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesBonusAccrual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesMotivationSettingsVersion_branchId_version_key" ON "SalesMotivationSettingsVersion"("branchId", "version");
CREATE INDEX "SalesMotivationSettingsVersion_branchId_isActive_idx" ON "SalesMotivationSettingsVersion"("branchId", "isActive");
CREATE INDEX "SalesMotivationSettingsVersion_createdById_idx" ON "SalesMotivationSettingsVersion"("createdById");
CREATE INDEX "SalesMotivationPlanLevel_versionId_idx" ON "SalesMotivationPlanLevel"("versionId");
CREATE INDEX "SalesMotivationAverageReceiptLevel_versionId_idx" ON "SalesMotivationAverageReceiptLevel"("versionId");
CREATE INDEX "SalesBonusAccrual_branchId_idx" ON "SalesBonusAccrual"("branchId");
CREATE INDEX "SalesBonusAccrual_versionId_idx" ON "SalesBonusAccrual"("versionId");
CREATE INDEX "SalesBonusAccrual_employeeId_idx" ON "SalesBonusAccrual"("employeeId");
CREATE INDEX "SalesBonusAccrual_saleId_idx" ON "SalesBonusAccrual"("saleId");
CREATE INDEX "SalesBonusAccrual_status_idx" ON "SalesBonusAccrual"("status");
CREATE INDEX "SalesBonusAccrual_kind_idx" ON "SalesBonusAccrual"("kind");
CREATE INDEX "SalesBonusAccrual_calculatedAt_idx" ON "SalesBonusAccrual"("calculatedAt");

ALTER TABLE "SalesMotivationSettingsVersion" ADD CONSTRAINT "SalesMotivationSettingsVersion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesMotivationSettingsVersion" ADD CONSTRAINT "SalesMotivationSettingsVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesMotivationPlanLevel" ADD CONSTRAINT "SalesMotivationPlanLevel_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SalesMotivationSettingsVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesMotivationAverageReceiptLevel" ADD CONSTRAINT "SalesMotivationAverageReceiptLevel_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SalesMotivationSettingsVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesBonusAccrual" ADD CONSTRAINT "SalesBonusAccrual_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesBonusAccrual" ADD CONSTRAINT "SalesBonusAccrual_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SalesMotivationSettingsVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesBonusAccrual" ADD CONSTRAINT "SalesBonusAccrual_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
