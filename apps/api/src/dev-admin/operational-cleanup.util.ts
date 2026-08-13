import { Prisma, PrismaClient, Role } from '@prisma/client';

/** Configuration tables and master data preserved during development cleanup. */
export const PRESERVED_TABLES = [
  'User',
  'RbacRole',
  'Permission',
  'RolePermission',
  'UserRole',
  'UserPermission',
  'Branch',
  'ProductCategory',
  'Product',
  'ProductPricingPolicy',
  'ProductPriceOverride',
  'PricingPolicyVersion',
  'PricingCategoryRule',
  'PricingProductRule',
  'PricingMasterSettings',
  'PricingPolicyVersionCategoryDiscount',
  'PricingPolicyVersionProductSnapshot',
  'BranchPriceProfile',
  'BranchPriceProfileCategoryDiscount',
  'FinanceAccountTypeDefinition',
  'FinanceAccount',
  'FinanceAccountAssignment',
  'Warehouse',
  'CentralWarehouse',
  'HqWarehouseManagerAssignment',
  'HqSalesManagerWarehouseAssignment',
  'TransportCompany',
  'Supplier',
  'SupplierContact',
  'Factory',
  'SkillLevel',
  'EmployeeCompensationRule',
  'BonusRule',
  'RoyaltyRule',
  'TaxProfile',
  'YuanRateHistory',
] as const;

/**
 * Operational Prisma models deleted in strict FK-safe order (children before parents).
 * Each name must match a Prisma delegate on TransactionClient.
 */
export const DELETE_STEPS = [
  // Notifications & temp files
  'alert',
  'fileAttachment',

  // Claims / returns / warehouse release
  'warrantyClaimItem',
  'warrantyClaim',
  'supplierClaim',
  'exchangeOrderItem',
  'exchangeOrder',
  'returnOrderItem',
  'returnOrder',
  'warehouseReleaseOrderItem',
  'warehouseReleaseOrder',
  'partsRequestItem',
  'partsRequest',

  // Reservations
  'reservationItem',
  'reservation',

  // FIFO allocations (before batches & distribution/sales)
  'saleFifoAllocation',
  'distributionFifoAllocation',

  // Sales & payments
  'saleInstallmentPayment',
  'saleInstallmentApproval',
  'salesCommission',
  'receipt',
  'payment',
  'installmentSchedule',
  'saleItem',
  'sale',

  // Branch invoice workflow (before goods receiving / distribution)
  'branchPayment',
  'branchOrderInstallment',
  'branchInvoice',

  // Shortage reports (before goods receiving)
  'shortageResolution',
  'shortageReportItem',
  'shortageReport',

  // Goods receiving (before distribution order items)
  'goodsReceivingItem',
  'goodsReceiving',

  // Distribution
  'hqWarehousePickingTask',
  'hqStockBooking',
  'branchDistributionOrderItem',
  'branchDistributionOrder',

  // Service orders
  'serviceOrderPayment',
  'repairCommission',
  'partsConsumption',
  'diagnosis',
  'repair',
  'serviceOrderPhoto',
  'warranty',
  'serviceOrder',

  // Finance operational
  'financeInvestment',
  'financeLedgerEntry',
  'financeExpense',
  'financeReconciliation',
  'financeTransfer',
  'cashierShift',

  // Inventory counts & FIFO layers
  'inventoryCountItem',
  'inventoryCountSession',
  'fifoInventoryBatch',
  'stockMovement',
  'inventoryBalance',

  // Procurement / receiving drafts
  'chinaReceivingDraftRow',
  'branchDistributionReceivingDraftRow',
  'branchDistributionReceivingDiscrepancy',
  'chinaReceivingEditSession',
  'procurementGoodsReceivingItem',
  'procurementGoodsReceiving',
  'procurementDifferenceReport',
  'procurementLandedCostSnapshot',
  'procurementCostAdjustment',
  'procurementSupplierPayment',
  'procurementSvhToHqTransport',
  'procurementOrderItem',
  'procurementOrder',

  // Branch requests / supply chain
  'replacementShipmentItem',
  'replacementShipment',
  'branchRequestIssue',
  'branchRequestShortage',
  'branchPurchaseRequestItem',
  'branchPurchaseRequest',
  'supplyInquiry',

  // Legacy transfers / purchase orders / logistics
  'stockTransferItem',
  'stockTransfer',
  'purchaseOrderItem',
  'purchaseOrder',
  'containerTrackingEvent',
  'logisticsShipment',

  // CRM
  'followUp',
  'customerEvent',
  'customer',

  // Product operational history (keep cards & pricing config)
  'productPriceHistory',
  'productPurchasePriceHistory',
  'productPricingChangeHistory',
  'productCodeMigration',
  'pricingSimulation',

  // Payroll / KPI operational
  'payrollRecord',
  'employeeKPI',
  'kpiSnapshot',
  'branchKpiTarget',
  'npsSurvey',
  'stockForecast',
  'branchStockRequest',

  // Franchise / expansion operational
  'matchmakingRecord',
  'depositAgreement',
  'investmentDeal',
  'franchiseApplication',
  'franchiseApproval',
  'franchiseCandidate',
  'investor',
  'cityAnalysis',
  'locationCandidate',

  // Tax / royalty operational documents
  'taxPayment',
  'taxReport',
  'taxReminder',
  'royaltyPayment',
  'royaltyInvoice',

  // AI / analytics operational
  'aiInsight',
  'salesForecast',
  'stockRiskPrediction',
  'customerPrediction',
  'kpiRecommendation',

  // Academy / marketing operational
  'certificate',
  'enrollment',
  'student',
  'lesson',
  'course',
  'banner',
  'promotion',
  'campaign',
  'marketingAsset',

  // Operational logs — preserved for audit trail (PERMANENT_DELETE, BUSINESS_DATE_CHANGED)
  // auditLog and loginHistory are intentionally excluded from bulk cleanup
] as const;

/** Operational tables targeted by development cleanup (alias of DELETE_STEPS for reporting). */
export const CLEANED_TABLES = DELETE_STEPS;

type PrismaTx = Prisma.TransactionClient;
export type DeleteStep = (typeof DELETE_STEPS)[number];

async function deleteAll(tx: PrismaTx, model: DeleteStep) {
  const delegate = tx[model] as { deleteMany: (args?: unknown) => Promise<{ count: number }> };
  if (!delegate?.deleteMany) {
    throw new Error(`Prisma delegate missing for model: ${model}`);
  }
  const result = await delegate.deleteMany();
  return result.count ?? 0;
}

export type DevDatabaseCleanupResult = {
  deleted: Record<string, number>;
  reset: Record<string, number>;
};

export type DevDatabaseCleanupVerification = {
  users: number;
  roles: number;
  productCategories: number;
  products: number;
  pricingPolicies: number;
  warehouses: number;
  financeAccounts: number;
  inventoryBalanceRows: number;
  inventoryQuantityTotal: number;
  inventoryValueTotal: number;
  financeBalanceTotal: number;
  sales: number;
  returns: number;
  payments: number;
  transfers: number;
  investments: number;
  stockMovements: number;
  customers: number;
  ledgerEntries: number;
  fifoBatches: number;
  alerts: number;
  auditLogs: number;
  passed: boolean;
  failures: string[];
};

export async function runDevDatabaseCleanup(prisma: PrismaClient): Promise<DevDatabaseCleanupResult> {
  const deleted: Record<string, number> = {};
  const reset: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      for (const model of DELETE_STEPS) {
        deleted[model] = await deleteAll(tx, model);
      }

      const accountReset = await tx.financeAccount.updateMany({
        data: {
          openingBalance: 0,
          currentBalance: 0,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
      reset.financeAccount = accountReset.count;

      const branchBalanceReset = await tx.branchAccountBalance.updateMany({
        data: { totalDebt: 0, totalPaid: 0, lastPaymentAt: null },
      });
      reset.branchAccountBalance = branchBalanceReset.count;

      // Safety net: zero any inventory balance rows that could not be deleted
      const inventoryReset = await tx.inventoryBalance.updateMany({
        data: {
          quantity: 0,
          reservedQuantity: 0,
          averageCostKgs: 0,
          landedCostKgs: 0,
          totalValueKgs: 0,
          lastReceivingAt: null,
        },
      });
      reset.inventoryBalance = inventoryReset.count;
    },
    { maxWait: 120_000, timeout: 600_000 },
  );

  return { deleted, reset };
}

export type TestDataCleanupCounts = Record<string, number>;

export async function getTestDataCleanupCounts(prisma: PrismaClient): Promise<TestDataCleanupCounts> {
  const [
    sales,
    payments,
    procurementOrders,
    stockMovements,
    customers,
    products,
    productCategories,
    users,
    ledgerEntries,
    fifoBatches,
    branchOrders,
  ] = await Promise.all([
    prisma.sale.count(),
    prisma.payment.count(),
    prisma.procurementOrder.count(),
    prisma.stockMovement.count(),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.productCategory.count(),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.financeLedgerEntry.count(),
    prisma.fifoInventoryBatch.count(),
    prisma.branchDistributionOrder.count(),
  ]);

  return {
    sale: sales,
    payment: payments,
    procurementOrder: procurementOrders,
    stockMovement: stockMovements,
    customer: customers,
    product: products,
    productCategory: productCategories,
    user: users,
    financeLedgerEntry: ledgerEntries,
    fifoInventoryBatch: fifoBatches,
    branchDistributionOrder: branchOrders,
  };
}

export async function runCategoryTestDataCleanup(
  prisma: PrismaClient,
  category: string,
  options?: { excludeUserId?: string },
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  if (category === 'all') {
    const result = await runDevDatabaseCleanup(prisma);
    return { ...result.deleted, ...result.reset };
  }

  const { CLEANUP_CATEGORY_STEPS } = await import('./test-data-cleanup.categories');
  const steps = CLEANUP_CATEGORY_STEPS[category as keyof typeof CLEANUP_CATEGORY_STEPS];
  if (!steps) {
    throw new Error(`Unknown cleanup category: ${category}`);
  }

  await prisma.$transaction(
    async (tx) => {
      for (const model of steps) {
        deleted[model] = await deleteAll(tx, model);
      }

      if (category === 'products') {
        const products = await tx.product.deleteMany();
        deleted.product = products.count;
        const categories = await tx.productCategory.deleteMany();
        deleted.productCategory = categories.count;
      }

      if (category === 'employees' && options?.excludeUserId) {
        const sysAdminUserIds = await tx.userRole.findMany({
          where: { role: { code: Role.SYSTEM_ADMINISTRATOR } },
          select: { userId: true },
        });
        const protectedIds = new Set([
          options.excludeUserId,
          ...sysAdminUserIds.map((r) => r.userId),
        ]);
        const loginHistory = await tx.loginHistory.deleteMany({
          where: { userId: { notIn: [...protectedIds] } },
        });
        deleted.loginHistory = loginHistory.count;
        const removedUsers = await tx.user.deleteMany({
          where: {
            id: { notIn: [...protectedIds] },
            role: { not: Role.SYSTEM_ADMINISTRATOR },
          },
        });
        deleted.user = removedUsers.count;
      }
    },
    { maxWait: 120_000, timeout: 600_000 },
  );

  return deleted;
}

export async function verifyDevDatabaseCleanup(prisma: PrismaClient): Promise<DevDatabaseCleanupVerification> {
  const [
    users,
    roles,
    productCategories,
    products,
    pricingPolicyVersions,
    productPricingPolicies,
    pricingMasterSettings,
    pricingCategoryRules,
    warehouses,
    financeAccounts,
    financeAccountTypes,
    inventoryBalances,
    sales,
    returns,
    payments,
    transfers,
    investments,
    stockMovements,
    customers,
    ledgerEntries,
    fifoBatches,
    alerts,
    auditLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.rbacRole.count(),
    prisma.productCategory.count(),
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.pricingPolicyVersion.count(),
    prisma.productPricingPolicy.count(),
    prisma.pricingMasterSettings.count(),
    prisma.pricingCategoryRule.count(),
    prisma.warehouse.count({ where: { deletedAt: null } }),
    prisma.financeAccount.count({ where: { deletedAt: null } }),
    prisma.financeAccountTypeDefinition.count(),
    prisma.inventoryBalance.findMany({
      select: { quantity: true, reservedQuantity: true, totalValueKgs: true },
    }),
    prisma.sale.count(),
    prisma.returnOrder.count(),
    prisma.payment.count(),
    prisma.financeTransfer.count(),
    prisma.financeInvestment.count(),
    prisma.stockMovement.count(),
    prisma.customer.count(),
    prisma.financeLedgerEntry.count(),
    prisma.fifoInventoryBatch.count(),
    prisma.alert.count(),
    prisma.auditLog.count(),
  ]);

  const pricingPolicies =
    pricingPolicyVersions + productPricingPolicies + pricingMasterSettings + pricingCategoryRules;

  const inventoryQuantityTotal = inventoryBalances.reduce(
    (sum, row) => sum + row.quantity + row.reservedQuantity,
    0,
  );
  const inventoryValueTotal = inventoryBalances.reduce(
    (sum, row) => sum + Number(row.totalValueKgs),
    0,
  );

  const financeAccountsRows = await prisma.financeAccount.findMany({
    where: { deletedAt: null },
    select: {
      currentBalance: true,
      availableBalance: true,
      pendingBalance: true,
      openingBalance: true,
    },
  });
  const financeBalanceTotal = financeAccountsRows.reduce(
    (sum, row) =>
      sum +
      Number(row.currentBalance) +
      Number(row.availableBalance) +
      Number(row.pendingBalance) +
      Number(row.openingBalance),
    0,
  );

  const failures: string[] = [];
  if (users === 0) failures.push('Users must be preserved');
  if (roles === 0) failures.push('Roles must be preserved');
  if (productCategories === 0) failures.push('Product categories must be preserved');
  if (products === 0) failures.push('Product cards must be preserved');
  if (pricingPolicies === 0) failures.push('Pricing policy configuration must be preserved');
  if (warehouses === 0) failures.push('Warehouses must be preserved');
  if (financeAccountTypes === 0) failures.push('Finance account types must be preserved');
  if (financeAccounts === 0 && financeAccountTypes > 0) {
    failures.push('Finance accounts must be preserved (run prisma:seed to create default accounts)');
  }
  if (inventoryQuantityTotal !== 0) failures.push(`Inventory quantities must be zero (found ${inventoryQuantityTotal})`);
  if (inventoryValueTotal !== 0) failures.push(`Inventory value must be zero (found ${inventoryValueTotal})`);
  if (financeBalanceTotal !== 0) failures.push(`Finance balances must be zero (found ${financeBalanceTotal})`);
  if (sales !== 0) failures.push(`Sales must be empty (found ${sales})`);
  if (returns !== 0) failures.push(`Returns must be empty (found ${returns})`);
  if (payments !== 0) failures.push(`Payments must be empty (found ${payments})`);
  if (transfers !== 0) failures.push(`Transfers must be empty (found ${transfers})`);
  if (investments !== 0) failures.push(`Investments must be empty (found ${investments})`);
  if (stockMovements !== 0) failures.push(`Stock movements must be empty (found ${stockMovements})`);
  if (customers !== 0) failures.push(`Customers must be empty (found ${customers})`);
  if (ledgerEntries !== 0) failures.push(`Ledger entries must be empty (found ${ledgerEntries})`);
  if (fifoBatches !== 0) failures.push(`FIFO batches must be empty (found ${fifoBatches})`);

  return {
    users,
    roles,
    productCategories,
    products,
    pricingPolicies,
    warehouses,
    financeAccounts,
    inventoryBalanceRows: inventoryBalances.length,
    inventoryQuantityTotal,
    inventoryValueTotal,
    financeBalanceTotal,
    sales,
    returns,
    payments,
    transfers,
    investments,
    stockMovements,
    customers,
    ledgerEntries,
    fifoBatches,
    alerts,
    auditLogs,
    passed: failures.length === 0,
    failures,
  };
}
