import { Prisma } from '@prisma/client';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';

function toDecimal(value: number | Prisma.Decimal) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/** Round only for final stored/display currency amounts (2 dp, half-up). */
export function roundDisplayMoney(value: number | Prisma.Decimal): number {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/** Display/storage unit cost derived from authoritative line total ÷ quantity. */
export function deriveDisplayUnitCost(totalCostKgs: number, quantity: number): number {
  const qty = Math.abs(Number(quantity));
  if (qty <= 0 || totalCostKgs <= 0) return 0;
  return roundDisplayMoney(toDecimal(totalCostKgs).div(qty));
}

/**
 * Allocate a share of an authoritative layer/batch total cost without rounding per unit first.
 * Uses full Decimal precision; caller rounds only when storing/displaying.
 */
export function allocateProportionalCost(
  layerTotalCostKgs: number,
  layerBaseQuantity: number,
  takeQuantity: number,
): number {
  const baseQty = Math.abs(Number(layerBaseQuantity));
  const take = Math.abs(Number(takeQuantity));
  if (take <= 0 || baseQty <= 0 || layerTotalCostKgs <= 0) return 0;
  return toDecimal(layerTotalCostKgs).mul(toDecimal(take).div(baseQty)).toNumber();
}

/** Sum monetary line totals with a single final 2dp round. */
export function sumDisplayMoneyTotals(amounts: number[]): number {
  let sum = new Prisma.Decimal(0);
  for (const amount of amounts) {
    sum = sum.plus(amount);
  }
  return roundDisplayMoney(sum);
}

/**
 * Split an authoritative order-line total across movements/shares so the sum matches exactly.
 */
export function distributeAuthoritativeLineTotal(rawShares: number[], lineTotalCostKgs: number): number[] {
  if (!rawShares.length) return [];
  const target = roundDisplayMoney(lineTotalCostKgs);
  if (target <= 0) return rawShares.map(() => 0);
  return distributeRoundedAmounts(rawShares, target);
}

/**
 * Reconcile rounded FIFO layer line costs so their sum matches the authoritative proportional total.
 * Assigns any currency remainder to the final allocation line.
 */
export function reconcileAuthoritativeLineCosts(rawLineCosts: number[]): number[] {
  if (!rawLineCosts.length) return [];
  const target = sumDisplayMoneyTotals(rawLineCosts);
  if (target <= 0) return rawLineCosts.map(() => 0);
  return distributeAuthoritativeLineTotal(rawLineCosts, target);
}
