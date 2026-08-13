import { Prisma } from '@prisma/client';
import { distributeRoundedMoneyAmounts } from './landed-cost-money.util';
import { distributeExactMoney, sumMoney, toExactMoney, toMoneyDecimal } from '../common/money/money';

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
  basePurchaseCostKgs: number | Prisma.Decimal | string;
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
  totalCost: number | Prisma.Decimal | string,
  line: AllocationLineContext,
  totals: AllocationTotals,
): number {
  return allocateExpenseAmountExact(method, totalCost, line, totals).toNumber();
}

export function allocateExpenseAmountExact(
  method: ExpenseAllocationMethod,
  totalCost: number | Prisma.Decimal | string,
  line: AllocationLineContext,
  totals: AllocationTotals,
): Prisma.Decimal {
  const pool = toMoneyDecimal(totalCost);
  if (pool.lte(0)) return new Prisma.Decimal(0);

  switch (method) {
    case 'BY_WEIGHT':
      if (!line.hasKnownWeight || totals.totalWeight <= 0 || line.lineShipmentWeightKg <= 0) {
        return new Prisma.Decimal(0);
      }
      return toExactMoney(
        pool.mul(toMoneyDecimal(line.lineShipmentWeightKg).div(totals.totalWeight)),
      );
    case 'BY_QUANTITY':
      if (totals.totalQuantity <= 0 || line.effectiveQuantity <= 0) return new Prisma.Decimal(0);
      return toExactMoney(
        pool.mul(toMoneyDecimal(line.effectiveQuantity).div(totals.totalQuantity)),
      );
    case 'BY_PURCHASE_VALUE':
      if (totals.totalPurchaseValue <= 0 || toMoneyDecimal(line.basePurchaseCostKgs).lte(0)) {
        return new Prisma.Decimal(0);
      }
      return toExactMoney(
        pool.mul(toMoneyDecimal(line.basePurchaseCostKgs).div(totals.totalPurchaseValue)),
      );
    case 'MANUAL':
    default:
      return new Prisma.Decimal(0);
  }
}

export function distributeExactAmounts(
  rawAmounts: Array<number | Prisma.Decimal | string>,
  targetTotal: number | Prisma.Decimal | string,
): Prisma.Decimal[] {
  return distributeExactMoney(rawAmounts, targetTotal);
}

export function distributeRoundedAmounts(rawAmounts: number[], targetTotal: number): number[] {
  return distributeRoundedMoneyAmounts(rawAmounts, targetTotal);
}

export function buildAllocationTotals(lines: AllocationLineContext[]): AllocationTotals {
  return {
    totalWeight: lines.reduce((sum, line) => sum + (line.hasKnownWeight ? line.lineShipmentWeightKg : 0), 0),
    totalQuantity: lines.reduce((sum, line) => sum + line.effectiveQuantity, 0),
    totalPurchaseValue: Number(sumMoney(lines.map((line) => line.basePurchaseCostKgs)).toFixed(15)),
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
