import { Prisma } from '@prisma/client';
import {
  consumeFifoLayerMoney,
  distributeMoneyToTarget,
  remainingFifoLayerMoney,
  roundMoneyKgs,
  sumMoney,
  toMoneyDecimal,
  toStoredMoneyKgs,
} from '../common/money/money';

function toDecimal(value: number | Prisma.Decimal) {
  return toMoneyDecimal(value);
}

/** Round only for final stored/display currency amounts (2 dp, half-up). */
export function roundDisplayMoney(value: number | Prisma.Decimal): number {
  return toStoredMoneyKgs(value);
}

/** Display/storage unit cost derived from authoritative line total ÷ quantity. */
export function deriveDisplayUnitCost(totalCostKgs: number, quantity: number): number {
  const qty = Math.abs(Number(quantity));
  if (qty <= 0 || toMoneyDecimal(totalCostKgs).lte(0)) return 0;
  return toStoredMoneyKgs(toMoneyDecimal(totalCostKgs).div(qty));
}

/**
 * Exact monetary value still on a FIFO layer.
 * Uses remainder-safe sequential consumption so original = consumed + remaining.
 */
export function computeLayerRemainingCostKgs(
  layerTotalCostKgs: number,
  layerBaseQuantity: number,
  remainingQuantity: number,
): number {
  return toStoredMoneyKgs(
    remainingFifoLayerMoney({
      originalLayerCost: layerTotalCostKgs,
      layerBaseQuantity,
      remainingQuantity,
    }),
  );
}

/**
 * Authoritative cost for consuming `takeQuantity` from a FIFO layer.
 * When the full remaining layer is consumed, uses the exact remaining layer total
 * (never rounded display unit × quantity).
 */
export function allocateLayerConsumptionCost(input: {
  layerTotalCostKgs: number;
  layerBaseQuantity: number;
  remainingQuantity: number;
  takeQuantity: number;
  remainingLayerCostKgs?: number;
}): number {
  return toStoredMoneyKgs(
    consumeFifoLayerMoney({
      originalLayerCost: input.layerTotalCostKgs,
      layerBaseQuantity: input.layerBaseQuantity,
      remainingQuantity: input.remainingQuantity,
      takeQuantity: input.takeQuantity,
      remainingLayerCost: input.remainingLayerCostKgs,
    }).consumedCost,
  );
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
  if (take <= 0 || baseQty <= 0 || toMoneyDecimal(layerTotalCostKgs).lte(0)) return 0;
  return toMoneyDecimal(layerTotalCostKgs).mul(toDecimal(take).div(baseQty)).toNumber();
}

/** Sum monetary line totals with a single final 2dp round. */
export function sumDisplayMoneyTotals(amounts: number[]): number {
  return toStoredMoneyKgs(sumMoney(amounts));
}

/**
 * Split an authoritative order-line total across movements/shares so the sum matches exactly.
 */
export function distributeAuthoritativeLineTotal(rawShares: number[], lineTotalCostKgs: number): number[] {
  if (!rawShares.length) return [];
  const target = roundMoneyKgs(lineTotalCostKgs);
  if (target.lte(0)) return rawShares.map(() => 0);
  return distributeMoneyToTarget(rawShares, target).map((value) => value.toNumber());
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
