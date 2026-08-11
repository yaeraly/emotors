import { shouldTransferBranchPurchaseAtCost } from '../operations/branch-purchase-estimated-amount.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';

export type HqBranchDistributionMoneyLine = {
  quantity: number;
  unitPrice: number;
  unitCost: number;
  totalPrice: number;
  totalCost: number;
  profit: number;
};

/** HQ Office → HQ Branch internal transfer (authoritative branch type, not name). */
export function isHqBranchInternalDistribution(branchType?: string | null): boolean {
  return shouldTransferBranchPurchaseAtCost(branchType);
}

/**
 * HQ internal distribution: authoritative transfer amount is at-cost with 0% HQ markup.
 * Preserves `totalPrice` / commercial transfer amount; aligns cost to revenue for profit = 0.
 */
export function applyHqBranchInternalDistributionProfit<T extends HqBranchDistributionMoneyLine>(
  line: T,
  branchType?: string | null,
): T {
  if (!isHqBranchInternalDistribution(branchType)) {
    return line;
  }

  const totalPrice = roundDisplayMoney(line.totalPrice);
  const quantity = Math.max(0, Number(line.quantity ?? 0));
  const unitPrice = quantity > 0 ? deriveDisplayUnitCost(totalPrice, quantity) : roundDisplayMoney(line.unitPrice);

  return {
    ...line,
    quantity,
    totalPrice,
    unitPrice,
    totalCost: totalPrice,
    unitCost: unitPrice,
    profit: 0,
  };
}

export function sumHqBranchDistributionOrderTotals(
  lines: Array<Pick<HqBranchDistributionMoneyLine, 'totalPrice' | 'totalCost'>>,
  branchType?: string | null,
): { totalAmount: number; totalCost: number; totalProfit: number } {
  const totalAmount = sumDisplayMoneyTotals(lines.map((line) => line.totalPrice));
  if (!isHqBranchInternalDistribution(branchType)) {
    const totalCost = sumDisplayMoneyTotals(lines.map((line) => line.totalCost));
    return {
      totalAmount,
      totalCost,
      totalProfit: roundDisplayMoney(totalAmount - totalCost),
    };
  }
  return { totalAmount, totalCost: totalAmount, totalProfit: 0 };
}

/** Normalize persisted/API distribution order money fields for HQ internal transfers. */
export function normalizeHqBranchDistributionOrderResponse<T extends Record<string, unknown>>(
  order: T,
  branchType?: string | null,
): T {
  if (!isHqBranchInternalDistribution(branchType)) {
    return order;
  }

  const totalAmount = roundDisplayMoney(Number(order.totalAmount ?? 0));
  const items = Array.isArray(order.items)
    ? order.items.map((raw) => {
        const item = raw as HqBranchDistributionMoneyLine & Record<string, unknown>;
        return applyHqBranchInternalDistributionProfit(item, branchType);
      })
    : order.items;

  return {
    ...order,
    totalAmount,
    totalCost: totalAmount,
    totalProfit: 0,
    items,
  };
}
