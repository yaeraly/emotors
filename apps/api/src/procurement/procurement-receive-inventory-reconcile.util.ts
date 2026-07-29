import { resolveUnitCostFromInventoryLayer } from '../pricing/pricing-fifo-unit-cost.util';
import {
  distributeAuthoritativeLineTotal,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';

export type ReceiveMovementSnapshot = {
  movementId: string;
  productId: string;
  warehouseId: string;
  branchId: string;
  quantity: number;
  totalCostKgs: number;
};

export type ReceiveMovementReconciliationPlan = ReceiveMovementSnapshot & {
  previousTotalCostKgs: number;
  reconciledTotalCostKgs: number;
  reconciledUnitCostKgs: number;
  deltaKgs: number;
};

/**
 * Reconcile per-line receive movement totals so their sum matches the authoritative
 * procurement order total exactly (remainder on the last qualifying line).
 */
export function reconcileLineTotalsToAuthoritativeOrderTotal(
  lineTotals: number[],
  authoritativeOrderTotalKgs: number,
): number[] {
  if (!lineTotals.length) return [];
  const target = roundDisplayMoney(authoritativeOrderTotalKgs);
  if (target <= 0) return lineTotals.map(() => 0);
  return distributeAuthoritativeLineTotal(lineTotals, target);
}

export function planProcurementReceiveInventoryReconciliation(
  movements: ReceiveMovementSnapshot[],
  authoritativeOrderTotalKgs: number,
): ReceiveMovementReconciliationPlan[] {
  const previousTotals = movements.map((movement) => roundDisplayMoney(movement.totalCostKgs));
  const reconciledTotals = reconcileLineTotalsToAuthoritativeOrderTotal(
    previousTotals,
    authoritativeOrderTotalKgs,
  );

  return movements.map((movement, index) => {
    const previousTotalCostKgs = previousTotals[index] ?? 0;
    const reconciledTotalCostKgs = reconciledTotals[index] ?? 0;
    const reconciledUnitCostKgs = resolveUnitCostFromInventoryLayer({
      quantity: movement.quantity,
      totalCostKgs: reconciledTotalCostKgs,
    });
    return {
      ...movement,
      previousTotalCostKgs,
      reconciledTotalCostKgs,
      reconciledUnitCostKgs,
      deltaKgs: roundDisplayMoney(reconciledTotalCostKgs - previousTotalCostKgs),
    };
  });
}

export function sumReceiveMovementTotals(movements: Array<{ totalCostKgs: number }>) {
  return sumDisplayMoneyTotals(movements.map((movement) => movement.totalCostKgs));
}
