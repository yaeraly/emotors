import { Prisma } from '@prisma/client';
import {
  distributeRoundedMoneyAmounts,
  roundMoneyDecimal,
  sumRoundedMoney,
  toMoneyDecimal,
} from './landed-cost-money.util';

export type ExpenseAllocationMethod = 'BY_WEIGHT' | 'BY_QUANTITY' | 'BY_PURCHASE_VALUE' | 'MANUAL';

export type ExpenseAllocationKey =
  | 'chinaDomesticTransportKgs'
  | 'chinaExportTransportKgs'
  | 'localTransportKgs'
  | 'packagingCostKgs'
  | 'customsCostKgs'
  | 'insuranceCostKgs'
  | 'bankFeeCostKgs'
  | 'otherExpenseKgs';

export const DEFAULT_EXPENSE_ALLOCATION: Record<ExpenseAllocationKey, ExpenseAllocationMethod> = {
  chinaDomesticTransportKgs: 'BY_WEIGHT',
  chinaExportTransportKgs: 'BY_WEIGHT',
  localTransportKgs: 'BY_WEIGHT',
  packagingCostKgs: 'BY_QUANTITY',
  customsCostKgs: 'BY_PURCHASE_VALUE',
  insuranceCostKgs: 'BY_PURCHASE_VALUE',
  bankFeeCostKgs: 'BY_PURCHASE_VALUE',
  otherExpenseKgs: 'BY_WEIGHT',
};

export type AllocationLineContext = {
  lineShipmentWeightKg: number;
  effectiveQuantity: number;
  basePurchaseCostKgs: number;
  hasKnownWeight: boolean;
};

export type AllocationTotals = {
  totalWeight: number;
  totalQuantity: number;
  totalPurchaseValue: number;
};

export function isWeightBasedAllocation(method: ExpenseAllocationMethod) {
  return method === 'BY_WEIGHT';
}

export function allocateExpenseAmount(
  method: ExpenseAllocationMethod,
  totalCost: number,
  line: AllocationLineContext,
  totals: AllocationTotals,
): number {
  const pool = toMoneyDecimal(totalCost);
  if (pool.lte(0)) return 0;

  switch (method) {
    case 'BY_WEIGHT':
      if (!line.hasKnownWeight || totals.totalWeight <= 0 || line.lineShipmentWeightKg <= 0) return 0;
      return pool.mul(toMoneyDecimal(line.lineShipmentWeightKg).div(totals.totalWeight)).toNumber();
    case 'BY_QUANTITY':
      if (totals.totalQuantity <= 0 || line.effectiveQuantity <= 0) return 0;
      return pool.mul(toMoneyDecimal(line.effectiveQuantity).div(totals.totalQuantity)).toNumber();
    case 'BY_PURCHASE_VALUE':
      if (totals.totalPurchaseValue <= 0 || line.basePurchaseCostKgs <= 0) return 0;
      return pool.mul(toMoneyDecimal(line.basePurchaseCostKgs).div(totals.totalPurchaseValue)).toNumber();
    case 'MANUAL':
    default:
      return 0;
  }
}

export function distributeRoundedAmounts(rawAmounts: number[], targetTotal: number): number[] {
  return distributeRoundedMoneyAmounts(rawAmounts, targetTotal);
}

export function buildAllocationTotals(lines: AllocationLineContext[]): AllocationTotals {
  return {
    totalWeight: lines.reduce((sum, line) => sum + (line.hasKnownWeight ? line.lineShipmentWeightKg : 0), 0),
    totalQuantity: lines.reduce((sum, line) => sum + line.effectiveQuantity, 0),
    totalPurchaseValue: sumRoundedMoney(lines.map((line) => line.basePurchaseCostKgs)),
  };
}

export function hasPendingWeightForExpense(
  expenseKey: ExpenseAllocationKey,
  allocationMethods: Record<ExpenseAllocationKey, ExpenseAllocationMethod>,
  expenseAmount: number,
  lines: AllocationLineContext[],
) {
  if (expenseAmount <= 0) return false;
  const method = allocationMethods[expenseKey] ?? DEFAULT_EXPENSE_ALLOCATION[expenseKey];
  if (!isWeightBasedAllocation(method)) return false;
  return lines.some((line) => !line.hasKnownWeight);
}
