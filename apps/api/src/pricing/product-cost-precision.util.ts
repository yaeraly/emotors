import { Prisma } from '@prisma/client';
import {
  consumeFifoLayerMoney,
  consumeFifoLayerMoneyKgs,
  distributeExactMoney,
  distributeMoneyToTarget,
  remainingFifoLayerMoney,
  remainingFifoLayerMoneyKgs,
  roundMoneyKgs,
  sumMoney,
  toExactUnitCost,
  toMoneyDecimal,
  toStoredMoneyKgs,
} from '../common/money/money';

function toDecimal(value: number | Prisma.Decimal | string) {
  return toMoneyDecimal(value);
}

/** Round only for final stored/display currency amounts (2 dp, half-up). */
export function roundDisplayMoney(value: number | Prisma.Decimal | string): number {
  return toStoredMoneyKgs(value);
}

/**
 * Display-only unit cost (2 dp). Never feed this back into accounting totals.
 */
export function deriveDisplayUnitCost(
  totalCostKgs: number | Prisma.Decimal | string,
  quantity: number,
): number {
  const qty = Math.abs(Number(quantity));
  if (qty <= 0 || toMoneyDecimal(totalCostKgs).lte(0)) return 0;
  return toStoredMoneyKgs(toExactUnitCost(totalCostKgs, qty));
}

/**
 * Authoritative exactUnitCost = lineTotal / qty at scale 15.
 * Must not be rounded to 2dp and multiplied back to rebuild the line total.
 */
export function deriveExactUnitCost(
  totalCostKgs: number | Prisma.Decimal | string,
  quantity: number,
): Prisma.Decimal {
  return toExactUnitCost(totalCostKgs, quantity);
}

/**
 * Exact monetary value still on a FIFO layer.
 * Uses remainder-safe sequential consumption so original = consumed + remaining.
 */
export function computeLayerRemainingCostExact(
  layerTotalCostKgs: number | Prisma.Decimal | string,
  layerBaseQuantity: number,
  remainingQuantity: number,
): Prisma.Decimal {
  return remainingFifoLayerMoney({
    originalLayerCost: layerTotalCostKgs,
    layerBaseQuantity,
    remainingQuantity,
  });
}

export function computeLayerRemainingCostKgs(
  layerTotalCostKgs: number | Prisma.Decimal | string,
  layerBaseQuantity: number,
  remainingQuantity: number,
): number {
  return toStoredMoneyKgs(
    remainingFifoLayerMoneyKgs({
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
export function allocateLayerConsumptionCostExact(input: {
  layerTotalCostKgs: number | Prisma.Decimal | string;
  layerBaseQuantity: number;
  remainingQuantity: number;
  takeQuantity: number;
  remainingLayerCostKgs?: number | Prisma.Decimal | string;
}): Prisma.Decimal {
  return consumeFifoLayerMoney({
    originalLayerCost: input.layerTotalCostKgs,
    layerBaseQuantity: input.layerBaseQuantity,
    remainingQuantity: input.remainingQuantity,
    takeQuantity: input.takeQuantity,
    remainingLayerCost: input.remainingLayerCostKgs,
  }).consumedCost;
}

export function allocateLayerConsumptionCost(input: {
  layerTotalCostKgs: number | Prisma.Decimal | string;
  layerBaseQuantity: number;
  remainingQuantity: number;
  takeQuantity: number;
  remainingLayerCostKgs?: number | Prisma.Decimal | string;
}): number {
  return toStoredMoneyKgs(
    consumeFifoLayerMoneyKgs({
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
export function allocateProportionalCostExact(
  layerTotalCostKgs: number | Prisma.Decimal | string,
  layerBaseQuantity: number,
  takeQuantity: number,
): Prisma.Decimal {
  const baseQty = Math.abs(Number(layerBaseQuantity));
  const take = Math.abs(Number(takeQuantity));
  if (take <= 0 || baseQty <= 0 || toMoneyDecimal(layerTotalCostKgs).lte(0)) {
    return new Prisma.Decimal(0);
  }
  if (take >= baseQty) return toMoneyDecimal(layerTotalCostKgs);
  return toMoneyDecimal(layerTotalCostKgs).mul(toDecimal(take)).div(baseQty);
}

export function allocateProportionalCost(
  layerTotalCostKgs: number | Prisma.Decimal | string,
  layerBaseQuantity: number,
  takeQuantity: number,
): number {
  return allocateProportionalCostExact(layerTotalCostKgs, layerBaseQuantity, takeQuantity).toNumber();
}

/** Sum monetary line totals with a single final 2dp round. */
export function sumDisplayMoneyTotals(
  amounts: Array<number | Prisma.Decimal | string>,
): number {
  return toStoredMoneyKgs(sumMoney(amounts));
}

/**
 * Split an authoritative total across shares so SUM(result) === target exactly (high precision).
 */
export function distributeExactAuthoritativeLineTotal(
  rawShares: Array<number | Prisma.Decimal | string>,
  lineTotalCostKgs: number | Prisma.Decimal | string,
): Prisma.Decimal[] {
  if (!rawShares.length) return [];
  const target = toMoneyDecimal(lineTotalCostKgs);
  if (target.lte(0)) return rawShares.map(() => new Prisma.Decimal(0));
  return distributeExactMoney(rawShares, target);
}

/**
 * Split an authoritative order-line total across movements/shares so the sum matches exactly.
 * 2dp paid-currency remainder path (display/legacy storage).
 */
export function distributeAuthoritativeLineTotal(
  rawShares: number[],
  lineTotalCostKgs: number | Prisma.Decimal | string,
): number[] {
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
