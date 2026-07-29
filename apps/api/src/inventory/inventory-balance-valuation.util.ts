import { Prisma, StockMovementType } from '@prisma/client';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../pricing/product-cost-precision.util';

export type InventoryBalanceMovementRow = {
  id: string;
  type: StockMovementType;
  quantity: number;
  unitCostKgs: number | Prisma.Decimal;
  totalCostKgs: number | Prisma.Decimal;
  createdAt: Date;
};

function movementQuantityDelta(type: StockMovementType, quantity: number) {
  const absolute = Math.abs(Number(quantity));
  if (type === StockMovementType.IN || type === StockMovementType.INVENTORY_ADJUSTMENT_IN) {
    return absolute;
  }
  if (
    type === StockMovementType.OUT ||
    type === StockMovementType.SALE ||
    type === StockMovementType.SERVICE_USE ||
    type === StockMovementType.INVENTORY_ADJUSTMENT_OUT
  ) {
    return -absolute;
  }
  return Number(quantity);
}

function movementLineCost(
  movement: InventoryBalanceMovementRow,
  delta: number,
  runningQty: number,
  runningValue: Prisma.Decimal,
) {
  const absQty = Math.abs(delta);
  const storedTotal = Number(movement.totalCostKgs ?? 0);
  if (storedTotal > 0) {
    return roundDisplayMoney(storedTotal);
  }
  const unit = Number(movement.unitCostKgs ?? 0);
  if (delta > 0) {
    return roundDisplayMoney(unit * absQty);
  }
  if (runningQty > 0) {
    return roundDisplayMoney(
      runningValue.mul(absQty).div(runningQty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
    );
  }
  return roundDisplayMoney(unit * absQty);
}

/**
 * Recompute inventory valuation from authoritative movement line totals.
 * Quantity is not returned — callers must not change balance quantity from this result.
 */
export function recomputeInventoryBalanceValuation(movements: InventoryBalanceMovementRow[]): {
  totalValueKgs: number;
  averageCostKgs: number;
  landedCostKgs: number;
} {
  const sorted = [...movements].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );

  let runningQty = 0;
  let runningValue = new Prisma.Decimal(0);
  let lastInboundUnit = 0;

  for (const movement of sorted) {
    const delta = movementQuantityDelta(movement.type, movement.quantity);
    if (delta === 0) {
      const adjustmentTotal = Number(movement.totalCostKgs ?? 0);
      if (adjustmentTotal !== 0) {
        runningValue = runningValue.plus(adjustmentTotal);
      }
      continue;
    }

    const lineCost = movementLineCost(movement, delta, runningQty, runningValue);
    if (delta > 0) {
      runningValue = runningValue.plus(lineCost);
      runningQty += delta;
      lastInboundUnit = deriveDisplayUnitCost(lineCost, delta);
    } else {
      runningValue = runningValue.minus(lineCost);
      runningQty = Math.max(0, runningQty + delta);
      if (runningQty === 0) {
        runningValue = new Prisma.Decimal(0);
      }
    }
  }

  const totalValueKgs = roundDisplayMoney(runningValue);
  const averageCostKgs = runningQty > 0 ? deriveDisplayUnitCost(totalValueKgs, runningQty) : 0;
  const landedCostKgs = lastInboundUnit > 0 ? lastInboundUnit : averageCostKgs;

  return { totalValueKgs, averageCostKgs, landedCostKgs };
}
