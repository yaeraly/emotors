import { resolveUnitCostFromInventoryLayer } from '../pricing/pricing-fifo-unit-cost.util';
import {
  allocateProportionalCost,
  distributeAuthoritativeLineTotal,
  roundDisplayMoney,
} from '../pricing/product-cost-precision.util';

export type MovementCostRow = {
  id: string;
  quantity: number;
  totalCostKgs: number;
  unitCostKgs: number;
};

export type MovementCostUpdate = {
  movementId: string;
  unitCostKgs: number;
  totalCostKgs: number;
};

/**
 * When a procurement order line has multiple HQ receive movements (separate China shipments),
 * never flatten them to one order-line unit cost. Preserve each shipment's share of landed value
 * so FIFO layers keep distinct unitLandedCostKgs.
 */
export function resolveMovementCostUpdates(input: {
  orderLineFinalUnitCostKgs: number;
  orderLineTotalCostKgs: number;
  movements: MovementCostRow[];
}): MovementCostUpdate[] {
  const movements = input.movements;
  if (!movements.length) return [];

  if (movements.length === 1) {
    const movement = movements[0]!;
    const qty = Math.abs(Number(movement.quantity));
    const totalCostKgs = roundDisplayMoney(Number(input.orderLineTotalCostKgs));
    const authoritativeUnit = roundDisplayMoney(Number(input.orderLineFinalUnitCostKgs));
    const unitCostKgs =
      authoritativeUnit > 0
        ? authoritativeUnit
        : resolveUnitCostFromInventoryLayer({ quantity: qty, totalCostKgs });
    return [{ movementId: movement.id, unitCostKgs, totalCostKgs }];
  }

  const oldLineTotal = movements.reduce((sum, row) => sum + Number(row.totalCostKgs), 0);
  const newLineTotal = roundDisplayMoney(Number(input.orderLineTotalCostKgs));
  const totalQty = movements.reduce((sum, row) => sum + Math.abs(Number(row.quantity)), 0);

  const rawShares = movements.map((movement) => {
    const qty = Math.abs(Number(movement.quantity));
    if (oldLineTotal > 0) {
      return allocateProportionalCost(newLineTotal, oldLineTotal, Number(movement.totalCostKgs));
    }
    if (totalQty > 0) {
      return allocateProportionalCost(newLineTotal, totalQty, qty);
    }
    return 0;
  });
  const reconciledTotals = distributeAuthoritativeLineTotal(rawShares, newLineTotal);

  return movements.map((movement, index) => {
    const qty = Math.abs(Number(movement.quantity));
    const totalCostKgs = reconciledTotals[index] ?? 0;
    const unitCostKgs = resolveUnitCostFromInventoryLayer({ quantity: qty, totalCostKgs });
    return { movementId: movement.id, unitCostKgs, totalCostKgs };
  });
}
