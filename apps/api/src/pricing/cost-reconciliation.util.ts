import { roundDisplayMoney } from './product-cost-precision.util';

/** Final KGS totals must match exactly — no tolerance for landed-cost parity. */
export const LANDED_COST_PARITY_TOLERANCE_KGS = 0;

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
  let sum = 0;
  for (const cost of lineCosts) {
    sum += cost;
  }
  return roundDisplayMoney(sum);
}
