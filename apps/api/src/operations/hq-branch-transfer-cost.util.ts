import { Prisma } from '@prisma/client';
import { roundMoneyDecimal, sumMoneyDecimals, toMoneyDecimal } from '../procurement/landed-cost-money.util';
import { deriveDisplayUnitCost } from '../pricing/product-cost-precision.util';

/**
 * HQ Office → HQ Branch internal transfer costing.
 *
 * Authoritative line cost = exact FIFO/inventory layer cost consumed (markup 0%).
 * FORBIDDEN for accounting totals: round(displayUnit, 2dp) × quantity.
 *
 * Decimal is used for aggregation; a single 2dp round applies only at the
 * final KGS money boundary (matches Prisma numeric(14,2) storage).
 */

/** Display-only unit derived from authoritative line cost ÷ quantity. Never multiply back for totals. */
export function deriveHqBranchTransferDisplayUnitCost(
  transferLineCostKgs: number | Prisma.Decimal,
  quantity: number,
): number {
  return deriveDisplayUnitCost(
    typeof transferLineCostKgs === 'number'
      ? transferLineCostKgs
      : transferLineCostKgs.toNumber(),
    quantity,
  );
}

/**
 * Authoritative HQ Branch transfer line cost.
 * Uses FIFO/landed line total only — never reconstructed from display unit × qty.
 */
export function resolveHqBranchTransferLineCostKgs(input: {
  fifoLineCostKgs?: number | Prisma.Decimal | string | null;
}): number {
  const raw = input.fifoLineCostKgs;
  if (raw == null) return 0;
  const cost = toMoneyDecimal(raw);
  if (cost.lte(0)) return 0;
  return roundMoneyDecimal(cost);
}

/** Sum HQ transfer line costs with Decimal precision; round once at the order-total boundary. */
export function sumHqBranchTransferLineCosts(
  lineCosts: Array<number | Prisma.Decimal | string>,
): number {
  if (!lineCosts.length) return 0;
  return roundMoneyDecimal(sumMoneyDecimals(lineCosts.map((value) => toMoneyDecimal(value))));
}

/**
 * Detects forbidden unit×qty reconstruction drift (e.g. 914369.80 → 914369.08).
 * Returns difference: authoritativeSum − unitTimesQtySum.
 */
export function measureUnitTimesQtyDriftKgs(
  lines: Array<{ transferLineCostKgs: number; quantity: number }>,
): { authoritativeSum: number; unitTimesQtySum: number; driftKgs: number } {
  const authoritativeSum = sumHqBranchTransferLineCosts(
    lines.map((line) => line.transferLineCostKgs),
  );
  let unitTimesQty = new Prisma.Decimal(0);
  for (const line of lines) {
    const displayUnit = deriveHqBranchTransferDisplayUnitCost(
      line.transferLineCostKgs,
      line.quantity,
    );
    unitTimesQty = unitTimesQty.plus(toMoneyDecimal(displayUnit).mul(line.quantity));
  }
  const unitTimesQtySum = roundMoneyDecimal(unitTimesQty);
  return {
    authoritativeSum,
    unitTimesQtySum,
    driftKgs: roundMoneyDecimal(toMoneyDecimal(authoritativeSum).minus(unitTimesQtySum)),
  };
}
