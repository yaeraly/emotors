-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'CEO', 'FRANCHISE_DIRECTOR', 'FINANCE_MANAGER', 'WAREHOUSE_MANAGER', 'CONTENT_CREATOR', 'ACADEMY_DIRECTOR', 'SYSTEM_ADMINISTRATOR', 'MANAGER', 'MASTER', 'ACCOUNTANT', 'SALESPERSON', 'FRANCHISE_OWNER', 'WAREHOUSE_OPERATOR', 'CASHIER', 'ACADEMY_MANAGER', 'MARKETING_MANAGER', 'PROCUREMENT_MANAGER', 'SUPPLY_CHAIN_MANAGER', 'INVESTMENT_MANAGER', 'EXPANSION_MANAGER');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('NEW', 'ACTIVE', 'VIP', 'SLEEPING', 'RISK', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomerEventType" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'VISIT', 'SALE', 'SERVICE', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'DEBT');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "StockMovementStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'QR', 'CARD', 'BANK_TRANSFER', 'MBANK', 'ELCART', 'BALANCE');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'SENT_TO_CUSTOMER', 'APPROVED_BY_CUSTOMER', 'FINALIZED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'SALE', 'SERVICE_USE', 'DEFECTIVE_IN');

-- CreateEnum
CREATE TYPE "BranchPurchaseRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED_TO_DISTRIBUTION_ORDER', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplacementShipmentStatus" AS ENUM ('OPEN', 'APPROVED', 'SENT', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED_TO_SALE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarehouseReleaseOrderStatus" AS ENUM ('PENDING', 'READY', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartsRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'RELEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnOrderStatus" AS ENUM ('PENDING', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED', 'REFUNDED', 'EXCHANGED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DEFECTIVE', 'WRONG_PRODUCT', 'WRONG_MODEL', 'CUSTOMER_CHANGED_MIND', 'WARRANTY_RETURN', 'SHIPPING_DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('REFUND', 'EXCHANGE', 'REJECTION', 'DEFECTIVE_STOCK', 'RESTOCK');

-- CreateEnum
CREATE TYPE "ExchangeOrderStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarrantyClaimStatus" AS ENUM ('PENDING', 'UNDER_INSPECTION', 'APPROVED', 'REJECTED', 'REPAIRED', 'REPLACED', 'SENT_TO_HQ', 'CLOSED');

-- CreateEnum
CREATE TYPE "HqWarrantyDecision" AS ENUM ('REPAIR', 'REPLACE', 'REJECT', 'SUPPLIER_CLAIM');

-- CreateEnum
CREATE TYPE "SupplierClaimStatus" AS ENUM ('DRAFT', 'SENT_TO_SUPPLIER', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPENSATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupplierClaimOutcome" AS ENUM ('REFUND', 'REPLACEMENT', 'CREDIT', 'REJECTED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'PROCUREMENT_ORDER_DELAYED', 'CONTAINER_DELAYED', 'BRANCH_DEBT_HIGH', 'INSTALLMENT_OVERDUE', 'WARRANTY_EXPIRING', 'RESERVATION_EXPIRING', 'RETURN_PENDING_APPROVAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('UNREAD', 'READ', 'RESOLVED');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'GRADUATED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MarketingAssetType" AS ENUM ('REELS_SCRIPT', 'POST', 'BANNER', 'PHOTO', 'VIDEO', 'WHATSAPP_TEXT', 'AD_COPY');

-- CreateEnum
CREATE TYPE "MarketingLanguage" AS ENUM ('KY', 'RU', 'EN');

-- CreateEnum
CREATE TYPE "RoyaltyRuleType" AS ENUM ('PERCENT_OF_REVENUE', 'PERCENT_OF_PROFIT', 'FIXED_MONTHLY');

-- CreateEnum
CREATE TYPE "RoyaltyInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'IN_PRODUCTION', 'SHIPPED_TO_YIWU', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProcurementShortageReason" AS ENUM ('FACTORY_SHORTAGE', 'SUPPLIER_SHORTAGE', 'DAMAGED_GOODS', 'LOST_IN_TRANSPORT', 'CUSTOMS_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcurementOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'ORDERED', 'PRODUCTION', 'READY_TO_SHIP', 'CUSTOMS_CLEARANCE', 'ARRIVED_IN_KYRGYZSTAN', 'RECEIVED_TO_HQ_WAREHOUSE', 'CLOSED', 'PAID', 'IN_PRODUCTION', 'SHIPPED_TO_YIWU', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BranchDistributionOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'SENT', 'RECEIVED', 'RECEIVED_WITH_DIFFERENCE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoodsReceivingStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShortageReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShortageReportItemType" AS ENUM ('SHORTAGE', 'OVERAGE');

-- CreateEnum
CREATE TYPE "BranchInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BranchPaymentMethod" AS ENUM ('CASH', 'QR', 'BANK', 'TRANSFER', 'INSTALLMENT', 'BALANCE');

-- CreateEnum
CREATE TYPE "InvestmentDealStatus" AS ENUM ('NEW', 'IN_DISCUSSION', 'DOCUMENTS', 'DEPOSIT_PAID', 'ACTIVE', 'CLOSED', 'LOST');

-- CreateEnum
CREATE TYPE "FranchiseApplicationStatus" AS ENUM ('NEW', 'REVIEW', 'APPROVED', 'REJECTED', 'OPENED');

-- CreateEnum
CREATE TYPE "TaxReportStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AiInsightType" AS ENUM ('SALES_FORECAST', 'STOCK_RISK', 'CUSTOMER_RETURN', 'KPI_RECOMMENDATION', 'BRANCH_ALERT', 'SLOW_MOVING_PRODUCT');

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('NEW', 'DIAGNOSIS', 'IN_REPAIR', 'WAITING_PARTS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BonusType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "ownerName" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "employeeId" TEXT,
    "phone" TEXT,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RbacRole" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RbacRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "branchId" TEXT NOT NULL,
    "status" "CustomerStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "totalPurchaseAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalProfitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDebtAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "CustomerEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profitAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "debtAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'DEBT',
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "draftReceiptText" TEXT,
    "whatsappMessageText" TEXT,
    "sentToCustomerAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productId" TEXT,
    "productSku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "profitAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentSchedule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "qrCodeData" TEXT NOT NULL,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "photoUrl" TEXT,
    "description" TEXT,
    "characteristics" JSONB,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "defaultSupplierId" TEXT,
    "defaultFactoryId" TEXT,
    "weightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "purchasePriceYuan" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "latestYuanRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "purchaseCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "finalCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sellingPriceKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "minStockLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameKy" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchasePriceYuan" DECIMAL(14,2) NOT NULL,
    "yuanRate" DECIMAL(14,4) NOT NULL,
    "purchaseCostKgs" DECIMAL(14,2) NOT NULL,
    "transportCostKgs" DECIMAL(14,2) NOT NULL,
    "finalCostKgs" DECIMAL(14,2) NOT NULL,
    "sellingPriceKgs" DECIMAL(14,2) NOT NULL,
    "marginAmount" DECIMAL(14,2) NOT NULL,
    "marginPercent" DECIMAL(8,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ProductPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YuanRateHistory" (
    "id" TEXT NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "YuanRateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" "StockMovementStatus" NOT NULL DEFAULT 'ACTIVE',
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "averageCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalValueKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiSnapshot" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalSales" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalRepairs" INTEGER NOT NULL DEFAULT 0,
    "averageRepairTime" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "inventoryValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lowStockCount" INTEGER NOT NULL DEFAULT 0,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "repeatCustomers" INTEGER NOT NULL DEFAULT 0,
    "debtAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "npsScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchKpiTarget" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "targetValue" DECIMAL(14,2) NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchKpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpsSurvey" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillLevel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "durationDays" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "level" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingAsset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MarketingAssetType" NOT NULL,
    "language" "MarketingLanguage" NOT NULL,
    "fileUrl" TEXT,
    "caption" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "targetUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyRule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "RoyaltyRuleType" NOT NULL,
    "percent" DECIMAL(8,2),
    "fixedAmount" DECIMAL(14,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoyaltyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyInvoice" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "royaltyAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "RoyaltyInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoyaltyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoyaltyPayment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoyaltyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "country" TEXT NOT NULL DEFAULT 'China',
    "city" TEXT,
    "address" TEXT,
    "wechat" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "productTypes" TEXT[],
    "reliabilityScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT,
    "position" TEXT,
    "wechat" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "address" TEXT,
    "productTypes" TEXT[],
    "productionCapacity" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "factoryId" TEXT,
    "hqWarehouseId" TEXT NOT NULL,
    "status" "ProcurementOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "defaultYuanRate" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "purchaseDate" TIMESTAMP(3),
    "totalYuan" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalTransportCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "costPerKg" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "chinaDomesticTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "chinaExportTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "localTransportKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packagingCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customsCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankFeeCostKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherExpenseKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estimatedArrivalDate" TIMESTAMP(3),
    "actualArrivalDate" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "receivedToHqAt" TIMESTAMP(3),
    "hqStockMovementCreatedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT,
    "factoryId" TEXT,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER,
    "purchasePriceYuan" DECIMAL(14,2) NOT NULL,
    "yuanRate" DECIMAL(14,4) NOT NULL,
    "costKgs" DECIMAL(14,2) NOT NULL,
    "weightKg" DECIMAL(14,3) NOT NULL,
    "totalWeightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "chinaDomesticAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "chinaExportAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "localTransportAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "packagingAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "customsAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insuranceAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bankFeeAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherAllocKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportCostKgs" DECIMAL(14,2) NOT NULL,
    "finalCostKgs" DECIMAL(14,2) NOT NULL,
    "totalYuan" DECIMAL(14,2) NOT NULL,
    "totalCostKgs" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalYuan" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalKgs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estimatedArrivalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceYuan" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalYuan" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "weightKg" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsShipment" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "shipmentNumber" TEXT NOT NULL,
    "carrier" TEXT,
    "originCity" TEXT,
    "destinationCity" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "estimatedArrivalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerTrackingEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentralWarehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentralWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "fromBranchId" TEXT,
    "toBranchId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchDistributionOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "status" "BranchDistributionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchDistributionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchDistributionOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "profit" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchDistributionOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceiving" (
    "id" TEXT NOT NULL,
    "receivingNumber" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "GoodsReceivingStatus" NOT NULL DEFAULT 'COMPLETED',
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GoodsReceiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceivingItem" (
    "id" TEXT NOT NULL,
    "receivingId" TEXT NOT NULL,
    "distributionOrderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sentQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceivingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortageReport" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "goodsReceivingId" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "status" "ShortageReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ShortageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortageReportItem" (
    "id" TEXT NOT NULL,
    "shortageReportId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "type" "ShortageReportItemType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortageReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "distributionOrderId" TEXT NOT NULL,
    "goodsReceivingId" TEXT NOT NULL,
    "status" "BranchInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "debtAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPayment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "BranchPaymentMethod" NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchAccountBalance" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "totalDebt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lastPaymentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'NEW',
    "problemDescription" TEXT NOT NULL,
    "diagnosisResult" TEXT,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "debtAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "warrantyUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "recommendedRepair" TEXT,
    "diagnosisFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "masterId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "laborCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "RepairStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Repair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsConsumption" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartsConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT,
    "branchId" TEXT NOT NULL,
    "warrantyNumber" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "WarrantyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensationRule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "fixedSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "salesCommissionPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "repairCommissionPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "partsCommissionPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "bonusPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EmployeeCompensationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCommission" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "commissionPercent" DECIMAL(8,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairCommission" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL,
    "commissionPercent" DECIMAL(8,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "repairRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repairCommissionPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "partsCommissionPercent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "repairCommissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsCommissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCommissionAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusRule" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "targetRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "targetProfit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonusType" "BonusType" NOT NULL,
    "bonusValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BonusRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRecord" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "payrollMonth" INTEGER NOT NULL,
    "payrollYear" INTEGER NOT NULL,
    "fixedSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "salesCommission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repairCommission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repairCommissionTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "partsCommissionTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "salesCommissionTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonusAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeKPI" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repairRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repairsCount" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "planAchievement" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeKPI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchStockRequest" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchStockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockForecast" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "currentQuantity" INTEGER NOT NULL,
    "forecastDemand" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investor" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "budgetAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interestType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseCandidate" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "investmentBudget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "experience" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentDeal" (
    "id" TEXT NOT NULL,
    "investorId" TEXT,
    "candidateId" TEXT,
    "status" "InvestmentDealStatus" NOT NULL DEFAULT 'NEW',
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositAgreement" (
    "id" TEXT NOT NULL,
    "investorId" TEXT,
    "candidateId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "signedAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepositAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchmakingRecord" (
    "id" TEXT NOT NULL,
    "investorId" TEXT,
    "candidateId" TEXT,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchmakingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CityAnalysis" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "population" INTEGER NOT NULL DEFAULT 0,
    "estimatedDemand" INTEGER NOT NULL DEFAULT 0,
    "competitors" INTEGER NOT NULL DEFAULT 0,
    "serviceDemandScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "partsDemandScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "priorityScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationCandidate" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "rentCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "trafficScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "visibilityScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "warehouseSuitability" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseApplication" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "FranchiseApplicationStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FranchiseApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FranchiseApproval" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FranchiseApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxProfile" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "taxId" TEXT,
    "legalName" TEXT NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReport" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "TaxReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPayment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "reportId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReminder" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInsight" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "type" "AiInsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesForecast" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "forecastDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedRevenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "confidence" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockRiskPrediction" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockRiskPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPrediction" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "probability" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRecommendation" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "metric" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementGoodsReceiving" (
    "id" TEXT NOT NULL,
    "receivingNumber" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "hqWarehouseId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementGoodsReceiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementGoodsReceivingItem" (
    "id" TEXT NOT NULL,
    "receivingId" TEXT NOT NULL,
    "procurementItemId" TEXT,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementGoodsReceivingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementDifferenceReport" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "receivingId" TEXT NOT NULL,
    "procurementOrderId" TEXT NOT NULL,
    "type" "ShortageReportItemType" NOT NULL,
    "status" "ShortageReportStatus" NOT NULL DEFAULT 'OPEN',
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "expectedQuantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "shortageReason" "ProcurementShortageReason",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProcurementDifferenceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPurchaseRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "BranchPurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "convertedOrderId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BranchPurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchPurchaseRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchPurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementShipment" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "shortageReportId" TEXT,
    "distributionOrderId" TEXT,
    "branchId" TEXT NOT NULL,
    "status" "ReplacementShipmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReplacementShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplacementShipmentItem" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplacementShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "convertedSaleId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationItem" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseReleaseOrder" (
    "id" TEXT NOT NULL,
    "releaseNumber" TEXT NOT NULL,
    "saleId" TEXT,
    "serviceOrderId" TEXT,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "status" "WarehouseReleaseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WarehouseReleaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseReleaseOrderItem" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseReleaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "PartsRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartsRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartsRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnOrder" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "status" "ReturnOrderStatus" NOT NULL DEFAULT 'PENDING',
    "reason" "ReturnReason" NOT NULL,
    "resolution" "ReturnResolution",
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReturnOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnOrderItem" (
    "id" TEXT NOT NULL,
    "returnOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "condition" TEXT,
    "defective" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReturnOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeOrder" (
    "id" TEXT NOT NULL,
    "exchangeNumber" TEXT NOT NULL,
    "returnOrderId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "ExchangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priceDifference" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExchangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeOrderItem" (
    "id" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL,
    "oldProductId" TEXT,
    "newProductId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "serialNumber" TEXT,
    "saleId" TEXT,
    "soldAt" TIMESTAMP(3),
    "soldById" TEXT,
    "installedById" TEXT,
    "warrantyUntil" TIMESTAMP(3),
    "status" "WarrantyClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "decision" TEXT,
    "note" TEXT,
    "hqReceivedAt" TIMESTAMP(3),
    "inspectedById" TEXT,
    "hqDecision" "HqWarrantyDecision",
    "hqResult" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaimItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaimItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierClaim" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "supplierId" TEXT,
    "factoryId" TEXT,
    "procurementOrderId" TEXT,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidencePhotos" TEXT[],
    "claimAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SupplierClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "outcome" "SupplierClaimOutcome",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RbacRole_code_key" ON "RbacRole"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "UserRole_assignedById_idx" ON "UserRole"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "LoginHistory_userId_idx" ON "LoginHistory"("userId");

-- CreateIndex
CREATE INDEX "LoginHistory_loginAt_idx" ON "LoginHistory"("loginAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "Customer_branchId_idx" ON "Customer"("branchId");

-- CreateIndex
CREATE INDEX "Customer_branchId_status_idx" ON "Customer"("branchId", "status");

-- CreateIndex
CREATE INDEX "Customer_fullName_idx" ON "Customer"("fullName");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_whatsappPhone_idx" ON "Customer"("whatsappPhone");

-- CreateIndex
CREATE INDEX "CustomerEvent_customerId_idx" ON "CustomerEvent"("customerId");

-- CreateIndex
CREATE INDEX "CustomerEvent_branchId_idx" ON "CustomerEvent"("branchId");

-- CreateIndex
CREATE INDEX "CustomerEvent_createdById_idx" ON "CustomerEvent"("createdById");

-- CreateIndex
CREATE INDEX "FollowUp_customerId_idx" ON "FollowUp"("customerId");

-- CreateIndex
CREATE INDEX "FollowUp_branchId_idx" ON "FollowUp"("branchId");

-- CreateIndex
CREATE INDEX "FollowUp_createdById_idx" ON "FollowUp"("createdById");

-- CreateIndex
CREATE INDEX "FollowUp_status_idx" ON "FollowUp"("status");

-- CreateIndex
CREATE INDEX "FollowUp_dueAt_idx" ON "FollowUp"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_receiptNumber_key" ON "Sale"("receiptNumber");

-- CreateIndex
CREATE INDEX "Sale_branchId_idx" ON "Sale"("branchId");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_sellerId_idx" ON "Sale"("sellerId");

-- CreateIndex
CREATE INDEX "Sale_paymentStatus_idx" ON "Sale"("paymentStatus");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE INDEX "Sale_saleDate_idx" ON "Sale"("saleDate");

-- CreateIndex
CREATE INDEX "Sale_receiptNumber_idx" ON "Sale"("receiptNumber");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_branchId_idx" ON "Payment"("branchId");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE INDEX "Payment_customerId_idx" ON "Payment"("customerId");

-- CreateIndex
CREATE INDEX "Payment_createdById_idx" ON "Payment"("createdById");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_branchId_idx" ON "InstallmentSchedule"("branchId");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_saleId_idx" ON "InstallmentSchedule"("saleId");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_customerId_idx" ON "InstallmentSchedule"("customerId");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_status_idx" ON "InstallmentSchedule"("status");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_dueDate_idx" ON "InstallmentSchedule"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_saleId_key" ON "Receipt"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "Receipt_branchId_idx" ON "Receipt"("branchId");

-- CreateIndex
CREATE INDEX "Receipt_receiptNumber_idx" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "Warehouse_branchId_idx" ON "Warehouse"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_branchId_code_key" ON "Warehouse"("branchId", "code");

-- CreateIndex
CREATE INDEX "Product_branchId_idx" ON "Product"("branchId");

-- CreateIndex
CREATE INDEX "Product_warehouseId_idx" ON "Product"("warehouseId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_defaultSupplierId_idx" ON "Product"("defaultSupplierId");

-- CreateIndex
CREATE INDEX "Product_defaultFactoryId_idx" ON "Product"("defaultFactoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_branchId_sku_key" ON "Product"("branchId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_code_key" ON "ProductCategory"("code");

-- CreateIndex
CREATE INDEX "ProductCategory_createdById_idx" ON "ProductCategory"("createdById");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_productId_idx" ON "ProductPriceHistory"("productId");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_createdById_idx" ON "ProductPriceHistory"("createdById");

-- CreateIndex
CREATE INDEX "ProductPriceHistory_effectiveFrom_idx" ON "ProductPriceHistory"("effectiveFrom");

-- CreateIndex
CREATE INDEX "YuanRateHistory_effectiveFrom_idx" ON "YuanRateHistory"("effectiveFrom");

-- CreateIndex
CREATE INDEX "YuanRateHistory_createdById_idx" ON "YuanRateHistory"("createdById");

-- CreateIndex
CREATE INDEX "StockMovement_branchId_idx" ON "StockMovement"("branchId");

-- CreateIndex
CREATE INDEX "StockMovement_warehouseId_idx" ON "StockMovement"("warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "StockMovement_createdById_idx" ON "StockMovement"("createdById");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_status_idx" ON "StockMovement"("status");

-- CreateIndex
CREATE INDEX "InventoryBalance_branchId_idx" ON "InventoryBalance"("branchId");

-- CreateIndex
CREATE INDEX "InventoryBalance_warehouseId_idx" ON "InventoryBalance"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryBalance_productId_idx" ON "InventoryBalance"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_branchId_warehouseId_productId_key" ON "InventoryBalance"("branchId", "warehouseId", "productId");

-- CreateIndex
CREATE INDEX "KpiSnapshot_branchId_idx" ON "KpiSnapshot"("branchId");

-- CreateIndex
CREATE INDEX "KpiSnapshot_snapshotDate_idx" ON "KpiSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "BranchKpiTarget_branchId_idx" ON "BranchKpiTarget"("branchId");

-- CreateIndex
CREATE INDEX "BranchKpiTarget_metric_idx" ON "BranchKpiTarget"("metric");

-- CreateIndex
CREATE INDEX "BranchKpiTarget_month_idx" ON "BranchKpiTarget"("month");

-- CreateIndex
CREATE INDEX "NpsSurvey_branchId_idx" ON "NpsSurvey"("branchId");

-- CreateIndex
CREATE INDEX "NpsSurvey_score_idx" ON "NpsSurvey"("score");

-- CreateIndex
CREATE INDEX "NpsSurvey_submittedAt_idx" ON "NpsSurvey"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SkillLevel_code_key" ON "SkillLevel"("code");

-- CreateIndex
CREATE INDEX "Course_level_idx" ON "Course"("level");

-- CreateIndex
CREATE INDEX "Course_isActive_idx" ON "Course"("isActive");

-- CreateIndex
CREATE INDEX "Lesson_courseId_idx" ON "Lesson"("courseId");

-- CreateIndex
CREATE INDEX "Student_branchId_idx" ON "Student"("branchId");

-- CreateIndex
CREATE INDEX "Student_status_idx" ON "Student"("status");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certificateNumber_key" ON "Certificate"("certificateNumber");

-- CreateIndex
CREATE INDEX "Certificate_studentId_idx" ON "Certificate"("studentId");

-- CreateIndex
CREATE INDEX "Certificate_courseId_idx" ON "Certificate"("courseId");

-- CreateIndex
CREATE INDEX "MarketingAsset_type_idx" ON "MarketingAsset"("type");

-- CreateIndex
CREATE INDEX "MarketingAsset_language_idx" ON "MarketingAsset"("language");

-- CreateIndex
CREATE INDEX "MarketingAsset_isActive_idx" ON "MarketingAsset"("isActive");

-- CreateIndex
CREATE INDEX "RoyaltyRule_branchId_idx" ON "RoyaltyRule"("branchId");

-- CreateIndex
CREATE INDEX "RoyaltyRule_isActive_idx" ON "RoyaltyRule"("isActive");

-- CreateIndex
CREATE INDEX "RoyaltyInvoice_branchId_idx" ON "RoyaltyInvoice"("branchId");

-- CreateIndex
CREATE INDEX "RoyaltyInvoice_month_idx" ON "RoyaltyInvoice"("month");

-- CreateIndex
CREATE INDEX "RoyaltyInvoice_status_idx" ON "RoyaltyInvoice"("status");

-- CreateIndex
CREATE INDEX "RoyaltyPayment_branchId_idx" ON "RoyaltyPayment"("branchId");

-- CreateIndex
CREATE INDEX "RoyaltyPayment_invoiceId_idx" ON "RoyaltyPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "RoyaltyPayment_paidAt_idx" ON "RoyaltyPayment"("paidAt");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateIndex
CREATE INDEX "Supplier_city_idx" ON "Supplier"("city");

-- CreateIndex
CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

-- CreateIndex
CREATE INDEX "Factory_supplierId_idx" ON "Factory"("supplierId");

-- CreateIndex
CREATE INDEX "Factory_isActive_idx" ON "Factory"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementOrder_orderNumber_key" ON "ProcurementOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "ProcurementOrder_supplierId_idx" ON "ProcurementOrder"("supplierId");

-- CreateIndex
CREATE INDEX "ProcurementOrder_factoryId_idx" ON "ProcurementOrder"("factoryId");

-- CreateIndex
CREATE INDEX "ProcurementOrder_hqWarehouseId_idx" ON "ProcurementOrder"("hqWarehouseId");

-- CreateIndex
CREATE INDEX "ProcurementOrder_status_idx" ON "ProcurementOrder"("status");

-- CreateIndex
CREATE INDEX "ProcurementOrder_createdById_idx" ON "ProcurementOrder"("createdById");

-- CreateIndex
CREATE INDEX "ProcurementOrder_approvedById_idx" ON "ProcurementOrder"("approvedById");

-- CreateIndex
CREATE INDEX "ProcurementOrderItem_orderId_idx" ON "ProcurementOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ProcurementOrderItem_productId_idx" ON "ProcurementOrderItem"("productId");

-- CreateIndex
CREATE INDEX "ProcurementOrderItem_supplierId_idx" ON "ProcurementOrderItem"("supplierId");

-- CreateIndex
CREATE INDEX "ProcurementOrderItem_factoryId_idx" ON "ProcurementOrderItem"("factoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orderNumber_key" ON "PurchaseOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_branchId_idx" ON "PurchaseOrder"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsShipment_shipmentNumber_key" ON "LogisticsShipment"("shipmentNumber");

-- CreateIndex
CREATE INDEX "LogisticsShipment_purchaseOrderId_idx" ON "LogisticsShipment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "LogisticsShipment_status_idx" ON "LogisticsShipment"("status");

-- CreateIndex
CREATE INDEX "ContainerTrackingEvent_shipmentId_idx" ON "ContainerTrackingEvent"("shipmentId");

-- CreateIndex
CREATE INDEX "ContainerTrackingEvent_happenedAt_idx" ON "ContainerTrackingEvent"("happenedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CentralWarehouse_code_key" ON "CentralWarehouse"("code");

-- CreateIndex
CREATE INDEX "StockTransfer_fromBranchId_idx" ON "StockTransfer"("fromBranchId");

-- CreateIndex
CREATE INDEX "StockTransfer_toBranchId_idx" ON "StockTransfer"("toBranchId");

-- CreateIndex
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");

-- CreateIndex
CREATE INDEX "StockTransferItem_stockTransferId_idx" ON "StockTransferItem"("stockTransferId");

-- CreateIndex
CREATE INDEX "StockTransferItem_productId_idx" ON "StockTransferItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchDistributionOrder_orderNumber_key" ON "BranchDistributionOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_branchId_idx" ON "BranchDistributionOrder"("branchId");

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_sourceWarehouseId_idx" ON "BranchDistributionOrder"("sourceWarehouseId");

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_destinationWarehouseId_idx" ON "BranchDistributionOrder"("destinationWarehouseId");

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_status_idx" ON "BranchDistributionOrder"("status");

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_createdById_idx" ON "BranchDistributionOrder"("createdById");

-- CreateIndex
CREATE INDEX "BranchDistributionOrder_approvedById_idx" ON "BranchDistributionOrder"("approvedById");

-- CreateIndex
CREATE INDEX "BranchDistributionOrderItem_orderId_idx" ON "BranchDistributionOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "BranchDistributionOrderItem_productId_idx" ON "BranchDistributionOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceiving_receivingNumber_key" ON "GoodsReceiving"("receivingNumber");

-- CreateIndex
CREATE INDEX "GoodsReceiving_distributionOrderId_idx" ON "GoodsReceiving"("distributionOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceiving_branchId_idx" ON "GoodsReceiving"("branchId");

-- CreateIndex
CREATE INDEX "GoodsReceiving_warehouseId_idx" ON "GoodsReceiving"("warehouseId");

-- CreateIndex
CREATE INDEX "GoodsReceiving_receivedById_idx" ON "GoodsReceiving"("receivedById");

-- CreateIndex
CREATE INDEX "GoodsReceiving_status_idx" ON "GoodsReceiving"("status");

-- CreateIndex
CREATE INDEX "GoodsReceivingItem_receivingId_idx" ON "GoodsReceivingItem"("receivingId");

-- CreateIndex
CREATE INDEX "GoodsReceivingItem_distributionOrderItemId_idx" ON "GoodsReceivingItem"("distributionOrderItemId");

-- CreateIndex
CREATE INDEX "GoodsReceivingItem_productId_idx" ON "GoodsReceivingItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortageReport_reportNumber_key" ON "ShortageReport"("reportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ShortageReport_goodsReceivingId_key" ON "ShortageReport"("goodsReceivingId");

-- CreateIndex
CREATE INDEX "ShortageReport_distributionOrderId_idx" ON "ShortageReport"("distributionOrderId");

-- CreateIndex
CREATE INDEX "ShortageReport_branchId_idx" ON "ShortageReport"("branchId");

-- CreateIndex
CREATE INDEX "ShortageReport_warehouseId_idx" ON "ShortageReport"("warehouseId");

-- CreateIndex
CREATE INDEX "ShortageReport_status_idx" ON "ShortageReport"("status");

-- CreateIndex
CREATE INDEX "ShortageReport_createdById_idx" ON "ShortageReport"("createdById");

-- CreateIndex
CREATE INDEX "ShortageReportItem_shortageReportId_idx" ON "ShortageReportItem"("shortageReportId");

-- CreateIndex
CREATE INDEX "ShortageReportItem_productId_idx" ON "ShortageReportItem"("productId");

-- CreateIndex
CREATE INDEX "ShortageReportItem_type_idx" ON "ShortageReportItem"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BranchInvoice_invoiceNumber_key" ON "BranchInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BranchInvoice_distributionOrderId_key" ON "BranchInvoice"("distributionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchInvoice_goodsReceivingId_key" ON "BranchInvoice"("goodsReceivingId");

-- CreateIndex
CREATE INDEX "BranchInvoice_branchId_idx" ON "BranchInvoice"("branchId");

-- CreateIndex
CREATE INDEX "BranchInvoice_status_idx" ON "BranchInvoice"("status");

-- CreateIndex
CREATE INDEX "BranchInvoice_dueDate_idx" ON "BranchInvoice"("dueDate");

-- CreateIndex
CREATE INDEX "BranchInvoice_createdById_idx" ON "BranchInvoice"("createdById");

-- CreateIndex
CREATE INDEX "BranchPayment_branchId_idx" ON "BranchPayment"("branchId");

-- CreateIndex
CREATE INDEX "BranchPayment_invoiceId_idx" ON "BranchPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "BranchPayment_method_idx" ON "BranchPayment"("method");

-- CreateIndex
CREATE INDEX "BranchPayment_paidAt_idx" ON "BranchPayment"("paidAt");

-- CreateIndex
CREATE INDEX "BranchPayment_createdById_idx" ON "BranchPayment"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "BranchAccountBalance_branchId_key" ON "BranchAccountBalance"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_orderNumber_key" ON "ServiceOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "ServiceOrder_branchId_idx" ON "ServiceOrder"("branchId");

-- CreateIndex
CREATE INDEX "ServiceOrder_customerId_idx" ON "ServiceOrder"("customerId");

-- CreateIndex
CREATE INDEX "ServiceOrder_masterId_idx" ON "ServiceOrder"("masterId");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");

-- CreateIndex
CREATE INDEX "Diagnosis_serviceOrderId_idx" ON "Diagnosis"("serviceOrderId");

-- CreateIndex
CREATE INDEX "Diagnosis_masterId_idx" ON "Diagnosis"("masterId");

-- CreateIndex
CREATE INDEX "Repair_serviceOrderId_idx" ON "Repair"("serviceOrderId");

-- CreateIndex
CREATE INDEX "Repair_masterId_idx" ON "Repair"("masterId");

-- CreateIndex
CREATE INDEX "Repair_status_idx" ON "Repair"("status");

-- CreateIndex
CREATE INDEX "PartsConsumption_serviceOrderId_idx" ON "PartsConsumption"("serviceOrderId");

-- CreateIndex
CREATE INDEX "PartsConsumption_productId_idx" ON "PartsConsumption"("productId");

-- CreateIndex
CREATE INDEX "PartsConsumption_warehouseId_idx" ON "PartsConsumption"("warehouseId");

-- CreateIndex
CREATE INDEX "PartsConsumption_createdById_idx" ON "PartsConsumption"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_warrantyNumber_key" ON "Warranty"("warrantyNumber");

-- CreateIndex
CREATE INDEX "Warranty_serviceOrderId_idx" ON "Warranty"("serviceOrderId");

-- CreateIndex
CREATE INDEX "Warranty_customerId_idx" ON "Warranty"("customerId");

-- CreateIndex
CREATE INDEX "Warranty_productId_idx" ON "Warranty"("productId");

-- CreateIndex
CREATE INDEX "Warranty_branchId_idx" ON "Warranty"("branchId");

-- CreateIndex
CREATE INDEX "Warranty_status_idx" ON "Warranty"("status");

-- CreateIndex
CREATE INDEX "EmployeeCompensationRule_branchId_idx" ON "EmployeeCompensationRule"("branchId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationRule_employeeId_idx" ON "EmployeeCompensationRule"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeCompensationRule_role_idx" ON "EmployeeCompensationRule"("role");

-- CreateIndex
CREATE INDEX "SalesCommission_employeeId_idx" ON "SalesCommission"("employeeId");

-- CreateIndex
CREATE INDEX "SalesCommission_saleId_idx" ON "SalesCommission"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCommission_employeeId_saleId_key" ON "SalesCommission"("employeeId", "saleId");

-- CreateIndex
CREATE INDEX "RepairCommission_branchId_idx" ON "RepairCommission"("branchId");

-- CreateIndex
CREATE INDEX "RepairCommission_employeeId_idx" ON "RepairCommission"("employeeId");

-- CreateIndex
CREATE INDEX "RepairCommission_serviceOrderId_idx" ON "RepairCommission"("serviceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairCommission_employeeId_serviceOrderId_key" ON "RepairCommission"("employeeId", "serviceOrderId");

-- CreateIndex
CREATE INDEX "BonusRule_branchId_idx" ON "BonusRule"("branchId");

-- CreateIndex
CREATE INDEX "BonusRule_role_idx" ON "BonusRule"("role");

-- CreateIndex
CREATE INDEX "PayrollRecord_branchId_idx" ON "PayrollRecord"("branchId");

-- CreateIndex
CREATE INDEX "PayrollRecord_employeeId_idx" ON "PayrollRecord"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollRecord_year_month_idx" ON "PayrollRecord"("year", "month");

-- CreateIndex
CREATE INDEX "PayrollRecord_payrollYear_payrollMonth_idx" ON "PayrollRecord"("payrollYear", "payrollMonth");

-- CreateIndex
CREATE INDEX "PayrollRecord_status_idx" ON "PayrollRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRecord_employeeId_payrollMonth_payrollYear_key" ON "PayrollRecord"("employeeId", "payrollMonth", "payrollYear");

-- CreateIndex
CREATE INDEX "EmployeeKPI_employeeId_idx" ON "EmployeeKPI"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeKPI_year_month_idx" ON "EmployeeKPI"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeKPI_employeeId_month_year_key" ON "EmployeeKPI"("employeeId", "month", "year");

-- CreateIndex
CREATE INDEX "BranchStockRequest_branchId_idx" ON "BranchStockRequest"("branchId");

-- CreateIndex
CREATE INDEX "BranchStockRequest_status_idx" ON "BranchStockRequest"("status");

-- CreateIndex
CREATE INDEX "StockForecast_branchId_idx" ON "StockForecast"("branchId");

-- CreateIndex
CREATE INDEX "StockForecast_riskLevel_idx" ON "StockForecast"("riskLevel");

-- CreateIndex
CREATE INDEX "Investor_status_idx" ON "Investor"("status");

-- CreateIndex
CREATE INDEX "Investor_city_idx" ON "Investor"("city");

-- CreateIndex
CREATE INDEX "FranchiseCandidate_status_idx" ON "FranchiseCandidate"("status");

-- CreateIndex
CREATE INDEX "FranchiseCandidate_city_idx" ON "FranchiseCandidate"("city");

-- CreateIndex
CREATE INDEX "InvestmentDeal_investorId_idx" ON "InvestmentDeal"("investorId");

-- CreateIndex
CREATE INDEX "InvestmentDeal_candidateId_idx" ON "InvestmentDeal"("candidateId");

-- CreateIndex
CREATE INDEX "InvestmentDeal_status_idx" ON "InvestmentDeal"("status");

-- CreateIndex
CREATE INDEX "DepositAgreement_investorId_idx" ON "DepositAgreement"("investorId");

-- CreateIndex
CREATE INDEX "DepositAgreement_candidateId_idx" ON "DepositAgreement"("candidateId");

-- CreateIndex
CREATE INDEX "MatchmakingRecord_investorId_idx" ON "MatchmakingRecord"("investorId");

-- CreateIndex
CREATE INDEX "MatchmakingRecord_candidateId_idx" ON "MatchmakingRecord"("candidateId");

-- CreateIndex
CREATE INDEX "FranchiseApplication_status_idx" ON "FranchiseApplication"("status");

-- CreateIndex
CREATE INDEX "FranchiseApproval_applicationId_idx" ON "FranchiseApproval"("applicationId");

-- CreateIndex
CREATE INDEX "TaxProfile_branchId_idx" ON "TaxProfile"("branchId");

-- CreateIndex
CREATE INDEX "TaxReport_branchId_idx" ON "TaxReport"("branchId");

-- CreateIndex
CREATE INDEX "TaxReport_month_idx" ON "TaxReport"("month");

-- CreateIndex
CREATE INDEX "TaxReport_status_idx" ON "TaxReport"("status");

-- CreateIndex
CREATE INDEX "TaxPayment_branchId_idx" ON "TaxPayment"("branchId");

-- CreateIndex
CREATE INDEX "TaxPayment_reportId_idx" ON "TaxPayment"("reportId");

-- CreateIndex
CREATE INDEX "TaxReminder_branchId_idx" ON "TaxReminder"("branchId");

-- CreateIndex
CREATE INDEX "TaxReminder_dueAt_idx" ON "TaxReminder"("dueAt");

-- CreateIndex
CREATE INDEX "AiInsight_branchId_idx" ON "AiInsight"("branchId");

-- CreateIndex
CREATE INDEX "AiInsight_type_idx" ON "AiInsight"("type");

-- CreateIndex
CREATE INDEX "SalesForecast_branchId_idx" ON "SalesForecast"("branchId");

-- CreateIndex
CREATE INDEX "StockRiskPrediction_branchId_idx" ON "StockRiskPrediction"("branchId");

-- CreateIndex
CREATE INDEX "StockRiskPrediction_riskLevel_idx" ON "StockRiskPrediction"("riskLevel");

-- CreateIndex
CREATE INDEX "CustomerPrediction_branchId_idx" ON "CustomerPrediction"("branchId");

-- CreateIndex
CREATE INDEX "KpiRecommendation_branchId_idx" ON "KpiRecommendation"("branchId");

-- CreateIndex
CREATE INDEX "KpiRecommendation_priority_idx" ON "KpiRecommendation"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementGoodsReceiving_receivingNumber_key" ON "ProcurementGoodsReceiving"("receivingNumber");

-- CreateIndex
CREATE INDEX "ProcurementGoodsReceiving_procurementOrderId_idx" ON "ProcurementGoodsReceiving"("procurementOrderId");

-- CreateIndex
CREATE INDEX "ProcurementGoodsReceiving_hqWarehouseId_idx" ON "ProcurementGoodsReceiving"("hqWarehouseId");

-- CreateIndex
CREATE INDEX "ProcurementGoodsReceiving_receivedById_idx" ON "ProcurementGoodsReceiving"("receivedById");

-- CreateIndex
CREATE INDEX "ProcurementGoodsReceivingItem_receivingId_idx" ON "ProcurementGoodsReceivingItem"("receivingId");

-- CreateIndex
CREATE INDEX "ProcurementGoodsReceivingItem_productId_idx" ON "ProcurementGoodsReceivingItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementDifferenceReport_reportNumber_key" ON "ProcurementDifferenceReport"("reportNumber");

-- CreateIndex
CREATE INDEX "ProcurementDifferenceReport_receivingId_idx" ON "ProcurementDifferenceReport"("receivingId");

-- CreateIndex
CREATE INDEX "ProcurementDifferenceReport_procurementOrderId_idx" ON "ProcurementDifferenceReport"("procurementOrderId");

-- CreateIndex
CREATE INDEX "ProcurementDifferenceReport_type_idx" ON "ProcurementDifferenceReport"("type");

-- CreateIndex
CREATE INDEX "ProcurementDifferenceReport_status_idx" ON "ProcurementDifferenceReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BranchPurchaseRequest_requestNumber_key" ON "BranchPurchaseRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "BranchPurchaseRequest_branchId_idx" ON "BranchPurchaseRequest"("branchId");

-- CreateIndex
CREATE INDEX "BranchPurchaseRequest_status_idx" ON "BranchPurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "BranchPurchaseRequest_createdById_idx" ON "BranchPurchaseRequest"("createdById");

-- CreateIndex
CREATE INDEX "BranchPurchaseRequest_convertedOrderId_idx" ON "BranchPurchaseRequest"("convertedOrderId");

-- CreateIndex
CREATE INDEX "BranchPurchaseRequestItem_requestId_idx" ON "BranchPurchaseRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "BranchPurchaseRequestItem_productId_idx" ON "BranchPurchaseRequestItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplacementShipment_shipmentNumber_key" ON "ReplacementShipment"("shipmentNumber");

-- CreateIndex
CREATE INDEX "ReplacementShipment_shortageReportId_idx" ON "ReplacementShipment"("shortageReportId");

-- CreateIndex
CREATE INDEX "ReplacementShipment_branchId_idx" ON "ReplacementShipment"("branchId");

-- CreateIndex
CREATE INDEX "ReplacementShipment_status_idx" ON "ReplacementShipment"("status");

-- CreateIndex
CREATE INDEX "ReplacementShipmentItem_shipmentId_idx" ON "ReplacementShipmentItem"("shipmentId");

-- CreateIndex
CREATE INDEX "ReplacementShipmentItem_productId_idx" ON "ReplacementShipmentItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_reservationNumber_key" ON "Reservation"("reservationNumber");

-- CreateIndex
CREATE INDEX "Reservation_branchId_idx" ON "Reservation"("branchId");

-- CreateIndex
CREATE INDEX "Reservation_customerId_idx" ON "Reservation"("customerId");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_expiresAt_idx" ON "Reservation"("expiresAt");

-- CreateIndex
CREATE INDEX "ReservationItem_reservationId_idx" ON "ReservationItem"("reservationId");

-- CreateIndex
CREATE INDEX "ReservationItem_productId_idx" ON "ReservationItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseReleaseOrder_releaseNumber_key" ON "WarehouseReleaseOrder"("releaseNumber");

-- CreateIndex
CREATE INDEX "WarehouseReleaseOrder_saleId_idx" ON "WarehouseReleaseOrder"("saleId");

-- CreateIndex
CREATE INDEX "WarehouseReleaseOrder_serviceOrderId_idx" ON "WarehouseReleaseOrder"("serviceOrderId");

-- CreateIndex
CREATE INDEX "WarehouseReleaseOrder_branchId_idx" ON "WarehouseReleaseOrder"("branchId");

-- CreateIndex
CREATE INDEX "WarehouseReleaseOrder_status_idx" ON "WarehouseReleaseOrder"("status");

-- CreateIndex
CREATE INDEX "WarehouseReleaseOrderItem_releaseId_idx" ON "WarehouseReleaseOrderItem"("releaseId");

-- CreateIndex
CREATE INDEX "WarehouseReleaseOrderItem_productId_idx" ON "WarehouseReleaseOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PartsRequest_requestNumber_key" ON "PartsRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "PartsRequest_serviceOrderId_idx" ON "PartsRequest"("serviceOrderId");

-- CreateIndex
CREATE INDEX "PartsRequest_branchId_idx" ON "PartsRequest"("branchId");

-- CreateIndex
CREATE INDEX "PartsRequest_status_idx" ON "PartsRequest"("status");

-- CreateIndex
CREATE INDEX "PartsRequestItem_requestId_idx" ON "PartsRequestItem"("requestId");

-- CreateIndex
CREATE INDEX "PartsRequestItem_productId_idx" ON "PartsRequestItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnOrder_returnNumber_key" ON "ReturnOrder"("returnNumber");

-- CreateIndex
CREATE INDEX "ReturnOrder_branchId_idx" ON "ReturnOrder"("branchId");

-- CreateIndex
CREATE INDEX "ReturnOrder_customerId_idx" ON "ReturnOrder"("customerId");

-- CreateIndex
CREATE INDEX "ReturnOrder_saleId_idx" ON "ReturnOrder"("saleId");

-- CreateIndex
CREATE INDEX "ReturnOrder_status_idx" ON "ReturnOrder"("status");

-- CreateIndex
CREATE INDEX "ReturnOrderItem_returnOrderId_idx" ON "ReturnOrderItem"("returnOrderId");

-- CreateIndex
CREATE INDEX "ReturnOrderItem_productId_idx" ON "ReturnOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeOrder_exchangeNumber_key" ON "ExchangeOrder"("exchangeNumber");

-- CreateIndex
CREATE INDEX "ExchangeOrder_returnOrderId_idx" ON "ExchangeOrder"("returnOrderId");

-- CreateIndex
CREATE INDEX "ExchangeOrder_branchId_idx" ON "ExchangeOrder"("branchId");

-- CreateIndex
CREATE INDEX "ExchangeOrder_status_idx" ON "ExchangeOrder"("status");

-- CreateIndex
CREATE INDEX "ExchangeOrderItem_exchangeId_idx" ON "ExchangeOrderItem"("exchangeId");

-- CreateIndex
CREATE INDEX "ExchangeOrderItem_newProductId_idx" ON "ExchangeOrderItem"("newProductId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_claimNumber_key" ON "WarrantyClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "WarrantyClaim_branchId_idx" ON "WarrantyClaim"("branchId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_customerId_idx" ON "WarrantyClaim"("customerId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_productId_idx" ON "WarrantyClaim"("productId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_saleId_idx" ON "WarrantyClaim"("saleId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_status_idx" ON "WarrantyClaim"("status");

-- CreateIndex
CREATE INDEX "WarrantyClaimItem_claimId_idx" ON "WarrantyClaimItem"("claimId");

-- CreateIndex
CREATE INDEX "WarrantyClaimItem_productId_idx" ON "WarrantyClaimItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierClaim_claimNumber_key" ON "SupplierClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "SupplierClaim_supplierId_idx" ON "SupplierClaim"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierClaim_factoryId_idx" ON "SupplierClaim"("factoryId");

-- CreateIndex
CREATE INDEX "SupplierClaim_procurementOrderId_idx" ON "SupplierClaim"("procurementOrderId");

-- CreateIndex
CREATE INDEX "SupplierClaim_productId_idx" ON "SupplierClaim"("productId");

-- CreateIndex
CREATE INDEX "SupplierClaim_status_idx" ON "SupplierClaim"("status");

-- CreateIndex
CREATE INDEX "Alert_branchId_idx" ON "Alert"("branchId");

-- CreateIndex
CREATE INDEX "Alert_type_idx" ON "Alert"("type");

-- CreateIndex
CREATE INDEX "Alert_status_idx" ON "Alert"("status");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RbacRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RbacRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentSchedule" ADD CONSTRAINT "InstallmentSchedule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentSchedule" ADD CONSTRAINT "InstallmentSchedule_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentSchedule" ADD CONSTRAINT "InstallmentSchedule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultSupplierId_fkey" FOREIGN KEY ("defaultSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_defaultFactoryId_fkey" FOREIGN KEY ("defaultFactoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceHistory" ADD CONSTRAINT "ProductPriceHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YuanRateHistory" ADD CONSTRAINT "YuanRateHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiSnapshot" ADD CONSTRAINT "KpiSnapshot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchKpiTarget" ADD CONSTRAINT "BranchKpiTarget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchKpiTarget" ADD CONSTRAINT "BranchKpiTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsSurvey" ADD CONSTRAINT "NpsSurvey_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpsSurvey" ADD CONSTRAINT "NpsSurvey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillLevel" ADD CONSTRAINT "SkillLevel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingAsset" ADD CONSTRAINT "MarketingAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyRule" ADD CONSTRAINT "RoyaltyRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyRule" ADD CONSTRAINT "RoyaltyRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyInvoice" ADD CONSTRAINT "RoyaltyInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyInvoice" ADD CONSTRAINT "RoyaltyInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPayment" ADD CONSTRAINT "RoyaltyPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPayment" ADD CONSTRAINT "RoyaltyPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RoyaltyInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoyaltyPayment" ADD CONSTRAINT "RoyaltyPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContact" ADD CONSTRAINT "SupplierContact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_hqWarehouseId_fkey" FOREIGN KEY ("hqWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrder" ADD CONSTRAINT "ProcurementOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProcurementOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementOrderItem" ADD CONSTRAINT "ProcurementOrderItem_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsShipment" ADD CONSTRAINT "LogisticsShipment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerTrackingEvent" ADD CONSTRAINT "ContainerTrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "LogisticsShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrder" ADD CONSTRAINT "BranchDistributionOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrder" ADD CONSTRAINT "BranchDistributionOrder_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrder" ADD CONSTRAINT "BranchDistributionOrder_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrder" ADD CONSTRAINT "BranchDistributionOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrder" ADD CONSTRAINT "BranchDistributionOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrderItem" ADD CONSTRAINT "BranchDistributionOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchDistributionOrderItem" ADD CONSTRAINT "BranchDistributionOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiving" ADD CONSTRAINT "GoodsReceiving_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiving" ADD CONSTRAINT "GoodsReceiving_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiving" ADD CONSTRAINT "GoodsReceiving_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceiving" ADD CONSTRAINT "GoodsReceiving_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivingItem" ADD CONSTRAINT "GoodsReceivingItem_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "GoodsReceiving"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivingItem" ADD CONSTRAINT "GoodsReceivingItem_distributionOrderItemId_fkey" FOREIGN KEY ("distributionOrderItemId") REFERENCES "BranchDistributionOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceivingItem" ADD CONSTRAINT "GoodsReceivingItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReport" ADD CONSTRAINT "ShortageReport_goodsReceivingId_fkey" FOREIGN KEY ("goodsReceivingId") REFERENCES "GoodsReceiving"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReport" ADD CONSTRAINT "ShortageReport_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReport" ADD CONSTRAINT "ShortageReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReport" ADD CONSTRAINT "ShortageReport_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReport" ADD CONSTRAINT "ShortageReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReportItem" ADD CONSTRAINT "ShortageReportItem_shortageReportId_fkey" FOREIGN KEY ("shortageReportId") REFERENCES "ShortageReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortageReportItem" ADD CONSTRAINT "ShortageReportItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInvoice" ADD CONSTRAINT "BranchInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInvoice" ADD CONSTRAINT "BranchInvoice_distributionOrderId_fkey" FOREIGN KEY ("distributionOrderId") REFERENCES "BranchDistributionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInvoice" ADD CONSTRAINT "BranchInvoice_goodsReceivingId_fkey" FOREIGN KEY ("goodsReceivingId") REFERENCES "GoodsReceiving"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchInvoice" ADD CONSTRAINT "BranchInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPayment" ADD CONSTRAINT "BranchPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPayment" ADD CONSTRAINT "BranchPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BranchInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPayment" ADD CONSTRAINT "BranchPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchAccountBalance" ADD CONSTRAINT "BranchAccountBalance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_masterId_fkey" FOREIGN KEY ("masterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsConsumption" ADD CONSTRAINT "PartsConsumption_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsConsumption" ADD CONSTRAINT "PartsConsumption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsConsumption" ADD CONSTRAINT "PartsConsumption_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsConsumption" ADD CONSTRAINT "PartsConsumption_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationRule" ADD CONSTRAINT "EmployeeCompensationRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensationRule" ADD CONSTRAINT "EmployeeCompensationRule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommission" ADD CONSTRAINT "SalesCommission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommission" ADD CONSTRAINT "SalesCommission_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCommission" ADD CONSTRAINT "RepairCommission_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCommission" ADD CONSTRAINT "RepairCommission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairCommission" ADD CONSTRAINT "RepairCommission_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusRule" ADD CONSTRAINT "BonusRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeKPI" ADD CONSTRAINT "EmployeeKPI_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchStockRequest" ADD CONSTRAINT "BranchStockRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockForecast" ADD CONSTRAINT "StockForecast_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentDeal" ADD CONSTRAINT "InvestmentDeal_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentDeal" ADD CONSTRAINT "InvestmentDeal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "FranchiseCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAgreement" ADD CONSTRAINT "DepositAgreement_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositAgreement" ADD CONSTRAINT "DepositAgreement_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "FranchiseCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchmakingRecord" ADD CONSTRAINT "MatchmakingRecord_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchmakingRecord" ADD CONSTRAINT "MatchmakingRecord_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "FranchiseCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FranchiseApproval" ADD CONSTRAINT "FranchiseApproval_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "FranchiseApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReport" ADD CONSTRAINT "TaxReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPayment" ADD CONSTRAINT "TaxPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReminder" ADD CONSTRAINT "TaxReminder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInsight" ADD CONSTRAINT "AiInsight_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesForecast" ADD CONSTRAINT "SalesForecast_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRiskPrediction" ADD CONSTRAINT "StockRiskPrediction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrediction" ADD CONSTRAINT "CustomerPrediction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRecommendation" ADD CONSTRAINT "KpiRecommendation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementGoodsReceiving" ADD CONSTRAINT "ProcurementGoodsReceiving_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementGoodsReceivingItem" ADD CONSTRAINT "ProcurementGoodsReceivingItem_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "ProcurementGoodsReceiving"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementDifferenceReport" ADD CONSTRAINT "ProcurementDifferenceReport_procurementOrderId_fkey" FOREIGN KEY ("procurementOrderId") REFERENCES "ProcurementOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchPurchaseRequestItem" ADD CONSTRAINT "BranchPurchaseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BranchPurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplacementShipmentItem" ADD CONSTRAINT "ReplacementShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "ReplacementShipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseReleaseOrderItem" ADD CONSTRAINT "WarehouseReleaseOrderItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "WarehouseReleaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartsRequestItem" ADD CONSTRAINT "PartsRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PartsRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnOrderItem" ADD CONSTRAINT "ReturnOrderItem_returnOrderId_fkey" FOREIGN KEY ("returnOrderId") REFERENCES "ReturnOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeOrderItem" ADD CONSTRAINT "ExchangeOrderItem_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "ExchangeOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaimItem" ADD CONSTRAINT "WarrantyClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "WarrantyClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

