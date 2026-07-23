import { resolveUnitCostFromInventoryLayer } from '../pricing/pricing-fifo-unit-cost.util';

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
    const unitCostKgs = roundMoney(Number(input.orderLineFinalUnitCostKgs));
    const totalCostKgs = roundMoney(qty * unitCostKgs);
    return [{ movementId: movement.id, unitCostKgs, totalCostKgs }];
  }

  const oldLineTotal = movements.reduce((sum, row) => sum + Number(row.totalCostKgs), 0);
  const newLineTotal = roundMoney(Number(input.orderLineTotalCostKgs));
  const totalQty = movements.reduce((sum, row) => sum + Math.abs(Number(row.quantity)), 0);

  return movements.map((movement) => {
    const qty = Math.abs(Number(movement.quantity));
    const valueShare =
      oldLineTotal > 0
        ? Number(movement.totalCostKgs) / oldLineTotal
        : totalQty > 0
          ? qty / totalQty
          : 0;
    const totalCostKgs = roundMoney(newLineTotal * valueShare);
    const unitCostKgs = resolveUnitCostFromInventoryLayer({ quantity: qty, totalCostKgs });
    return { movementId: movement.id, unitCostKgs, totalCostKgs };
  });
}
