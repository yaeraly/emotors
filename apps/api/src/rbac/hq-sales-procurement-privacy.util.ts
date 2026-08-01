import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { canViewProductCost, isHqSalesManagerScopedUser } from './rbac';

/** HQ Sales Manager must not access procurement, supplier, factory, or internal cost data. */
export function assertHqSalesCannotAccessProcurementData(user: Pick<AuthUser, 'role' | 'roles'>) {
  if (isHqSalesManagerScopedUser(user)) {
    throw new ForbiddenException('Forbidden resource');
  }
}

export function shouldStripConfidentialCommercialFields(
  user: Pick<AuthUser, 'role' | 'roles' | 'branchId' | 'permissions'>,
) {
  return !canViewProductCost(user);
}

const RESTRICTED_PRODUCT_ROOT_KEYS = [
  'purchasePriceYuan',
  'purchasePriceUpdatedAt',
  'purchaseCostKgs',
  'transportCostKgs',
  'finalCostKgs',
  'costPriceKgs',
  'marginAmount',
  'marginPercent',
  'latestYuanRate',
  'storedFinalCostKgs',
  'storedCostPriceKgs',
  'currentFifoUnitCost',
  'costAvailable',
  'costSource',
  'costBatchId',
  'costReceivedAt',
  'costWarehouseId',
  'defaultSupplierId',
  'defaultFactoryId',
  'defaultSupplier',
  'defaultFactory',
  'supplier',
  'factory',
  'purchasePriceHistory',
  'priceHistory',
  'stockMovements',
  'wholesaleMarkupPercent',
  'minimumWholesaleMarkupPercent',
  'hqBranchWholesaleMarkupPercent',
  'recommendedRetailMarkupPercent',
  'minimumSellingMarkupPercent',
  'maximumRetailMarkupPercent',
  'maximumWholesaleMarkupPercent',
] as const;

export function stripConfidentialCommercialFields<T extends Record<string, unknown>>(payload: T): T {
  const next: Record<string, unknown> = { ...payload };
  for (const key of RESTRICTED_PRODUCT_ROOT_KEYS) {
    delete next[key];
  }
  if (next.product && typeof next.product === 'object') {
    next.product = stripConfidentialCommercialFields(next.product as Record<string, unknown>);
  }
  return next as T;
}

const RESTRICTED_BRANCH_DASHBOARD_KEYS = ['totalProfit', 'inventoryValue'] as const;

export function sanitizeBranchDashboardForRestrictedFinancialView<T extends Record<string, unknown>>(
  dashboard: T,
): T {
  const next: Record<string, unknown> = { ...dashboard };
  for (const key of RESTRICTED_BRANCH_DASHBOARD_KEYS) {
    delete next[key];
  }
  return next as T;
}

export function sanitizeHqB2bSaleForRestrictedFinancialView(sale: Record<string, unknown>) {
  const items = Array.isArray(sale.items)
    ? sale.items.map((raw) => {
        if (!raw || typeof raw !== 'object') return raw;
        const item = raw as Record<string, unknown>;
        return {
          id: item.id,
          saleId: item.saleId,
          productId: item.productId,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          categoryNameSnapshot: item.categoryNameSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        };
      })
    : sale.items;

  return {
    ...sale,
    items,
  };
}
