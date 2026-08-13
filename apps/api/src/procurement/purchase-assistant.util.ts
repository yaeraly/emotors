export type PurchaseAssistantPeriodDays = 30 | 60 | 90;

export type PurchaseAssistantPriority = 'URGENT' | 'RECOMMENDED' | 'SUFFICIENT';

export type PurchaseAssistantInputs = {
  salesQuantity: number;
  periodDays: number;
  reserveDays: number;
  hqAvailableQuantity: number;
  onTheWayQuantity: number;
  approvedBranchOrderQuantity: number;
};

export type PurchaseAssistantCalculation = {
  salesQuantity: number;
  periodDays: number;
  reserveDays: number;
  averageDailySales: number;
  requiredStock: number;
  hqAvailableQuantity: number;
  onTheWayQuantity: number;
  approvedBranchOrderQuantity: number;
  recommendedQuantity: number;
  orderingRequired: boolean;
  priority: PurchaseAssistantPriority;
};

export function normalizePeriodDays(value: unknown): PurchaseAssistantPeriodDays {
  const n = Number(value);
  if (n === 60) return 60;
  if (n === 90) return 90;
  return 30;
}

export function normalizeReserveDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 10;
  return Math.min(Math.floor(n), 365);
}

/**
 * Recommended purchase qty =
 *   sales(period) + approved branch orders + required safety stock
 *   − HQ available − on the way
 * Required safety stock = (sales / days) × reserve days
 */
export function calculatePurchaseRecommendation(
  input: PurchaseAssistantInputs,
): PurchaseAssistantCalculation {
  const salesQuantity = Math.max(0, Math.floor(Number(input.salesQuantity) || 0));
  const periodDays = Math.max(1, Math.floor(Number(input.periodDays) || 30));
  const reserveDays = Math.max(0, Math.floor(Number(input.reserveDays) || 0));
  const hqAvailableQuantity = Math.max(0, Math.floor(Number(input.hqAvailableQuantity) || 0));
  const onTheWayQuantity = Math.max(0, Math.floor(Number(input.onTheWayQuantity) || 0));
  const approvedBranchOrderQuantity = Math.max(
    0,
    Math.floor(Number(input.approvedBranchOrderQuantity) || 0),
  );

  const averageDailySales = salesQuantity / periodDays;
  const requiredStock = Math.ceil(averageDailySales * reserveDays);
  const raw =
    salesQuantity +
    approvedBranchOrderQuantity +
    requiredStock -
    hqAvailableQuantity -
    onTheWayQuantity;
  const recommendedQuantity = raw > 0 ? Math.ceil(raw) : 0;
  const orderingRequired = recommendedQuantity > 0;

  let priority: PurchaseAssistantPriority = 'SUFFICIENT';
  if (orderingRequired) {
    priority =
      hqAvailableQuantity <= 0 || hqAvailableQuantity < requiredStock
        ? 'URGENT'
        : 'RECOMMENDED';
  }

  return {
    salesQuantity,
    periodDays,
    reserveDays,
    averageDailySales,
    requiredStock,
    hqAvailableQuantity,
    onTheWayQuantity,
    approvedBranchOrderQuantity,
    recommendedQuantity,
    orderingRequired,
    priority,
  };
}

export function prioritySortRank(priority: PurchaseAssistantPriority): number {
  if (priority === 'URGENT') return 0;
  if (priority === 'RECOMMENDED') return 1;
  return 2;
}
