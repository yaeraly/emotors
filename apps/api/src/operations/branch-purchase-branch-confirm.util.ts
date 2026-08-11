import type { Product } from '@prisma/client';
import { sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';
import { buildDistributionLinesFromConfirmedRequestItems } from './branch-purchase-confirm.util';
import { sumBranchPurchaseLineProductCosts } from './branch-purchase-fifo-cost.util';

export type BranchPurchaseConfirmLineSnapshot = {
  approvedQuantity?: number | null;
  estimatedLineProductCostKgs?: unknown;
};

/**
 * Branch Sales «Согласовать заказ» is commercial/workflow confirmation only.
 * Inventory FIFO is validated/consumed later at HQ Warehouse fulfillment — never here.
 */
export function sumPersistedApprovedInventoryCostKgs(
  items: BranchPurchaseConfirmLineSnapshot[],
): number {
  return sumBranchPurchaseLineProductCosts(
    items
      .filter((item) => (item.approvedQuantity ?? 0) > 0)
      .map((item) => Number(item.estimatedLineProductCostKgs ?? 0)),
  );
}

export function buildBranchPurchaseConfirmDistributionLines<
  T extends Parameters<typeof buildDistributionLinesFromConfirmedRequestItems>[0][number],
>(
  items: T[],
  productsById: Map<string, Pick<Product, 'id' | 'sku' | 'name' | 'finalCostKgs'>>,
  options?: { branchType?: string | null },
) {
  return buildDistributionLinesFromConfirmedRequestItems(items, productsById, options);
}

export function sumBranchPurchaseConfirmDistributionCostKgs(
  lines: Array<{ totalCost: number }>,
): number {
  return sumDisplayMoneyTotals(lines.map((line) => line.totalCost));
}
