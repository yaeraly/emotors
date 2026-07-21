import { Prisma, PrismaClient } from '@prisma/client';

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
  'PricingSimulation',
  'BranchPriceProfile',
  'BranchPriceProfileCategoryDiscount',
  'FinanceAccountTypeDefinition',
  'FinanceAccount',
  'FinanceAccountAssignment',
  'Warehouse',
  'CentralWarehouse',
  'TransportCompany',
  'Supplier',
  'Factory',
  'SkillLevel',
  'EmployeeCompensationRule',
  'BonusRule',
  'RoyaltyRule',
] as const;

/** Operational tables targeted by development cleanup. */
export const CLEANED_TABLES = [
  'Customer',
  'CustomerEvent',
  'FollowUp',
  'Sale',
  'SaleItem',
  'Payment',
  'InstallmentSchedule',
  'SaleInstallmentApproval',
  'SaleInstallmentPayment',
  'Receipt',
  'Reservation',
  'ReservationItem',
  'ReturnOrder',
  'ReturnOrderItem',
  'ExchangeOrder',
  'ExchangeOrderItem',
  'StockMovement',
  'InventoryBalance',
  'InventoryCountSession',
  'InventoryCountItem',
  'FifoInventoryBatch',
  'SaleFifoAllocation',
  'DistributionFifoAllocation',
  'FinanceInvestment',
  'FinanceLedgerEntry',
  'FinanceTransfer',
  'FinanceExpense',
  'FinanceReconciliation',
  'CashierShift',
  'ProcurementOrder',
  'ProcurementOrderItem',
  'PurchaseOrder',
  'PurchaseOrderItem',
  'LogisticsShipment',
  'GoodsReceiving',
  'GoodsReceivingItem',
  'BranchDistributionOrder',
  'BranchDistributionOrderItem',
  'BranchInvoice',
  'BranchPayment',
  'BranchOrderInstallment',
  'BranchPurchaseRequest',
  'BranchPurchaseRequestItem',
  'ServiceOrder',
  'ServiceOrderPayment',
  'PartsConsumption',
  'Alert',
  'AuditLog',
  'LoginHistory',
  'KpiSnapshot',
  'BranchAccountBalance',
] as const;

type PrismaTx = Prisma.TransactionClient;

async function deleteAll(tx: PrismaTx, model: keyof PrismaTx, label: string) {
  const delegate = tx[model] as { deleteMany: (args?: unknown) => Promise<{ count: number }> };
  if (!delegate?.deleteMany) return 0;
  const result = await delegate.deleteMany();
  return result.count ?? 0;
}

export type DevDatabaseCleanupResult = {
  deleted: Record<string, number>;
  reset: Record<string, number>;
};

export async function runDevDatabaseCleanup(prisma: PrismaClient): Promise<DevDatabaseCleanupResult> {
  const deleted: Record<string, number> = {};
  const reset: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      // Notifications
      deleted.alert = await deleteAll(tx, 'alert', 'alert');

      // Returns / exchanges / warranty / supplier claims
      for (const model of [
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
      ] as const) {
        deleted[model] = await deleteAll(tx, model, model);
      }

      // Reservations
      deleted.reservationItem = await deleteAll(tx, 'reservationItem', 'reservationItem');
      deleted.reservation = await deleteAll(tx, 'reservation', 'reservation');

      // Sales chain
      deleted.saleFifoAllocation = await deleteAll(tx, 'saleFifoAllocation', 'saleFifoAllocation');
      deleted.saleInstallmentPayment = await deleteAll(tx, 'saleInstallmentPayment', 'saleInstallmentPayment');
      deleted.saleInstallmentApproval = await deleteAll(tx, 'saleInstallmentApproval', 'saleInstallmentApproval');
      deleted.installmentSchedule = await deleteAll(tx, 'installmentSchedule', 'installmentSchedule');
      deleted.receipt = await deleteAll(tx, 'receipt', 'receipt');
      deleted.payment = await deleteAll(tx, 'payment', 'payment');
      deleted.saleItem = await deleteAll(tx, 'saleItem', 'saleItem');
      deleted.sale = await deleteAll(tx, 'sale', 'sale');

      // CRM
      deleted.followUp = await deleteAll(tx, 'followUp', 'followUp');
      deleted.customerEvent = await deleteAll(tx, 'customerEvent', 'customerEvent');
      deleted.customer = await deleteAll(tx, 'customer', 'customer');

      // Branch order / invoice workflow
      deleted.branchPayment = await deleteAll(tx, 'branchPayment', 'branchPayment');
      deleted.branchOrderInstallment = await deleteAll(tx, 'branchOrderInstallment', 'branchOrderInstallment');
      deleted.branchInvoice = await deleteAll(tx, 'branchInvoice', 'branchInvoice');

      // Service
      deleted.serviceOrderPayment = await deleteAll(tx, 'serviceOrderPayment', 'serviceOrderPayment');
      deleted.partsConsumption = await deleteAll(tx, 'partsConsumption', 'partsConsumption');
      deleted.diagnosis = await deleteAll(tx, 'diagnosis', 'diagnosis');
      deleted.repair = await deleteAll(tx, 'repair', 'repair');
      deleted.serviceOrderPhoto = await deleteAll(tx, 'serviceOrderPhoto', 'serviceOrderPhoto');
      deleted.serviceOrder = await deleteAll(tx, 'serviceOrder', 'serviceOrder');

      // Finance operational (investments before ledger entries)
      deleted.financeInvestment = await deleteAll(tx, 'financeInvestment', 'financeInvestment');
      deleted.financeLedgerEntry = await deleteAll(tx, 'financeLedgerEntry', 'financeLedgerEntry');
      deleted.financeTransfer = await deleteAll(tx, 'financeTransfer', 'financeTransfer');
      deleted.financeExpense = await deleteAll(tx, 'financeExpense', 'financeExpense');
      deleted.financeReconciliation = await deleteAll(tx, 'financeReconciliation', 'financeReconciliation');
      deleted.cashierShift = await deleteAll(tx, 'cashierShift', 'cashierShift');

      const accountReset = await tx.financeAccount.updateMany({
        data: {
          openingBalance: 0,
          currentBalance: 0,
          availableBalance: 0,
          pendingBalance: 0,
        },
      });
      reset.financeAccount = accountReset.count;

      // Warehouse / inventory
      deleted.distributionFifoAllocation = await deleteAll(tx, 'distributionFifoAllocation', 'distributionFifoAllocation');
      deleted.inventoryCountItem = await deleteAll(tx, 'inventoryCountItem', 'inventoryCountItem');
      deleted.inventoryCountSession = await deleteAll(tx, 'inventoryCountSession', 'inventoryCountSession');
      deleted.stockMovement = await deleteAll(tx, 'stockMovement', 'stockMovement');
      deleted.inventoryBalance = await deleteAll(tx, 'inventoryBalance', 'inventoryBalance');
      deleted.fifoInventoryBatch = await deleteAll(tx, 'fifoInventoryBatch', 'fifoInventoryBatch');

      // Distribution / procurement
      for (const model of [
        'shortageResolution',
        'shortageReportItem',
        'shortageReport',
        'hqWarehousePickingTask',
        'branchDistributionOrderItem',
        'branchDistributionOrder',
        'goodsReceivingItem',
        'goodsReceiving',
        'procurementGoodsReceivingItem',
        'procurementGoodsReceiving',
        'chinaReceivingDraftRow',
        'chinaReceivingEditSession',
        'procurementDifferenceReport',
        'procurementLandedCostSnapshot',
        'procurementCostAdjustment',
        'procurementSupplierPayment',
        'procurementSvhToHqTransport',
        'procurementOrderItem',
        'procurementOrder',
        'purchaseOrderItem',
        'purchaseOrder',
        'containerTrackingEvent',
        'logisticsShipment',
        'stockTransferItem',
        'stockTransfer',
        'branchRequestIssue',
        'branchRequestShortage',
        'branchPurchaseRequestItem',
        'branchPurchaseRequest',
        'hqStockBooking',
        'supplyInquiry',
        'replacementShipmentItem',
        'replacementShipment',
      ] as const) {
        deleted[model] = await deleteAll(tx, model, model);
      }

      // Commissions / payroll operational snapshots
      deleted.salesCommission = await deleteAll(tx, 'salesCommission', 'salesCommission');
      deleted.repairCommission = await deleteAll(tx, 'repairCommission', 'repairCommission');
      deleted.payrollRecord = await deleteAll(tx, 'payrollRecord', 'payrollRecord');
      deleted.employeeKPI = await deleteAll(tx, 'employeeKPI', 'employeeKPI');

      // Franchise investment CRM module (operational deals, keep Investor master if any)
      deleted.matchmakingRecord = await deleteAll(tx, 'matchmakingRecord', 'matchmakingRecord');
      deleted.depositAgreement = await deleteAll(tx, 'depositAgreement', 'depositAgreement');
      deleted.investmentDeal = await deleteAll(tx, 'investmentDeal', 'investmentDeal');
      deleted.franchiseApplication = await deleteAll(tx, 'franchiseApplication', 'franchiseApplication');
      deleted.franchiseApproval = await deleteAll(tx, 'franchiseApproval', 'franchiseApproval');
      deleted.franchiseCandidate = await deleteAll(tx, 'franchiseCandidate', 'franchiseCandidate');
      deleted.investor = await deleteAll(tx, 'investor', 'investor');

      // Tax / royalty operational
      deleted.taxPayment = await deleteAll(tx, 'taxPayment', 'taxPayment');
      deleted.taxReport = await deleteAll(tx, 'taxReport', 'taxReport');
      deleted.taxReminder = await deleteAll(tx, 'taxReminder', 'taxReminder');
      deleted.royaltyPayment = await deleteAll(tx, 'royaltyPayment', 'royaltyPayment');
      deleted.royaltyInvoice = await deleteAll(tx, 'royaltyInvoice', 'royaltyInvoice');

      // AI / analytics operational
      deleted.aiInsight = await deleteAll(tx, 'aiInsight', 'aiInsight');
      deleted.salesForecast = await deleteAll(tx, 'salesForecast', 'salesForecast');
      deleted.stockRiskPrediction = await deleteAll(tx, 'stockRiskPrediction', 'stockRiskPrediction');
      deleted.customerPrediction = await deleteAll(tx, 'customerPrediction', 'customerPrediction');
      deleted.kpiRecommendation = await deleteAll(tx, 'kpiRecommendation', 'kpiRecommendation');

      // KPI / branch statistics
      deleted.kpiSnapshot = await deleteAll(tx, 'kpiSnapshot', 'kpiSnapshot');
      deleted.branchKpiTarget = await deleteAll(tx, 'branchKpiTarget', 'branchKpiTarget');
      deleted.npsSurvey = await deleteAll(tx, 'npsSurvey', 'npsSurvey');
      deleted.stockForecast = await deleteAll(tx, 'stockForecast', 'stockForecast');
      deleted.branchStockRequest = await deleteAll(tx, 'branchStockRequest', 'branchStockRequest');

      const branchBalanceReset = await tx.branchAccountBalance.updateMany({
        data: { totalDebt: 0, totalPaid: 0, lastPaymentAt: null },
      });
      reset.branchAccountBalance = branchBalanceReset.count;

      // Operational logs
      deleted.auditLog = await deleteAll(tx, 'auditLog', 'auditLog');
      deleted.loginHistory = await deleteAll(tx, 'loginHistory', 'loginHistory');

      // Temporary / attachment files linked to operational entities
      deleted.fileAttachment = await deleteAll(tx, 'fileAttachment', 'fileAttachment');
    },
    { maxWait: 60_000, timeout: 300_000 },
  );

  return { deleted, reset };
}
