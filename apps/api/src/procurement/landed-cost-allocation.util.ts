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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isWeightBasedAllocation(method: ExpenseAllocationMethod) {
  return method === 'BY_WEIGHT';
}

export function allocateExpenseAmount(
  method: ExpenseAllocationMethod,
  totalCost: number,
  line: AllocationLineContext,
  totals: AllocationTotals,
): number {
  if (totalCost <= 0) return 0;
  switch (method) {
    case 'BY_WEIGHT':
      if (!line.hasKnownWeight || totals.totalWeight <= 0 || line.lineShipmentWeightKg <= 0) return 0;
      return roundMoney((totalCost * line.lineShipmentWeightKg) / totals.totalWeight);
    case 'BY_QUANTITY':
      if (totals.totalQuantity <= 0 || line.effectiveQuantity <= 0) return 0;
      return roundMoney((totalCost * line.effectiveQuantity) / totals.totalQuantity);
    case 'BY_PURCHASE_VALUE':
      if (totals.totalPurchaseValue <= 0 || line.basePurchaseCostKgs <= 0) return 0;
      return roundMoney((totalCost * line.basePurchaseCostKgs) / totals.totalPurchaseValue);
    case 'MANUAL':
    default:
      return 0;
  }
}

export function buildAllocationTotals(lines: AllocationLineContext[]): AllocationTotals {
  return {
    totalWeight: lines.reduce((sum, line) => sum + (line.hasKnownWeight ? line.lineShipmentWeightKg : 0), 0),
    totalQuantity: lines.reduce((sum, line) => sum + line.effectiveQuantity, 0),
    totalPurchaseValue: lines.reduce((sum, line) => sum + line.basePurchaseCostKgs, 0),
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
