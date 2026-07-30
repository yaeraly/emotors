import { roundDisplayMoney, sumDisplayMoneyTotals } from './product-cost-precision.util';

/** Final KGS totals must match exactly — no tolerance for landed-cost parity. */
export const LANDED_COST_PARITY_TOLERANCE_KGS = 0;

/** Shown when branch-order transfer cost does not match reserved/consumed FIFO layers. */
export const BRANCH_ORDER_COST_MISMATCH_MESSAGE =
  'Себестоимость заказа не совпадает с себестоимостью складских партий. Пересчитайте себестоимость перед подтверждением.';

export type CostReconciliationResult = {
  ok: boolean;
  expectedKgs: number;
  actualKgs: number;
  differenceKgs: number;
  message: string;
};

export function compareAuthoritativeCostTotals(
  expectedKgs: number,
  actualKgs: number,
  label: string,
  toleranceKgs = LANDED_COST_PARITY_TOLERANCE_KGS,
): CostReconciliationResult {
  const expected = roundDisplayMoney(expectedKgs);
  const actual = roundDisplayMoney(actualKgs);
  const differenceKgs = roundDisplayMoney(actual - expected);
  const ok = Math.abs(differenceKgs) <= toleranceKgs;
  const message = ok
    ? `${label}: totals match (${expected} KGS)`
    : `${label}: expected ${expected} KGS, actual ${actual} KGS, difference ${differenceKgs} KGS`;
  return { ok, expectedKgs: expected, actualKgs: actual, differenceKgs, message };
}

export function assertAuthoritativeCostTotals(
  expectedKgs: number,
  actualKgs: number,
  label: string,
  toleranceKgs = LANDED_COST_PARITY_TOLERANCE_KGS,
): void {
  const result = compareAuthoritativeCostTotals(expectedKgs, actualKgs, label, toleranceKgs);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export function sumAuthoritativeLineCosts(lineCosts: number[]): number {
  return sumDisplayMoneyTotals(lineCosts);
}

export type BranchTransferReconciliationContext = {
  orderId?: string;
  shipmentId?: string | null;
  warehouseId?: string;
  branchPurchaseRequestNumber?: string;
};

export function reconcileBranchTransferCost(
  fifoAllocationCosts: number[],
  orderTransferCostKgs: number,
  label = 'branch transfer',
): CostReconciliationResult {
  const fifoTotal = sumDisplayMoneyTotals(fifoAllocationCosts);
  return compareAuthoritativeCostTotals(fifoTotal, orderTransferCostKgs, label);
}

export function logBranchTransferReconciliationFailure(
  logger: { error: (payload: Record<string, unknown>) => void },
  result: CostReconciliationResult,
  context: BranchTransferReconciliationContext,
) {
  logger.error({
    message: 'BRANCH_ORDER_COST_RECONCILIATION_FAILED',
    shipmentId: context.shipmentId ?? null,
    orderId: context.orderId,
    warehouseId: context.warehouseId,
    branchPurchaseRequestNumber: context.branchPurchaseRequestNumber,
    expectedTotal: result.expectedKgs,
    actualTotal: result.actualKgs,
    differenceKgs: result.differenceKgs,
    detail: result.message,
  });
}
