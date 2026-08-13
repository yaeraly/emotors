import { isMoneyEqual, sumMoney, toMoneyDecimal, type MoneyInput } from '../common/money/money';
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
  totalCostKgs: MoneyInput;
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
 * If the exact Decimal sum already matches, do not 2dp-round and redistribute.
 */
export function reconcileLineTotalsToAuthoritativeOrderTotal(
  lineTotals: Array<number | string>,
  authoritativeOrderTotalKgs: number | string,
): number[] {
  if (!lineTotals.length) return [];
  const target = roundDisplayMoney(authoritativeOrderTotalKgs);
  if (target <= 0) return lineTotals.map(() => 0);
  return distributeAuthoritativeLineTotal(lineTotals.map((row) => Number(row)), target);
}

export function planProcurementReceiveInventoryReconciliation(
  movements: ReceiveMovementSnapshot[],
  authoritativeOrderTotalKgs: MoneyInput,
): ReceiveMovementReconciliationPlan[] {
  if (isMoneyEqual(sumMoney(movements.map((row) => row.totalCostKgs)), authoritativeOrderTotalKgs)) {
    return movements.map((movement) => {
      const total = roundDisplayMoney(toMoneyDecimal(movement.totalCostKgs));
      return {
        ...movement,
        previousTotalCostKgs: total,
        reconciledTotalCostKgs: total,
        reconciledUnitCostKgs: resolveUnitCostFromInventoryLayer({
          quantity: movement.quantity,
          totalCostKgs: movement.totalCostKgs,
        }),
        deltaKgs: 0,
      };
    });
  }

  const previousTotals = movements.map((movement) => roundDisplayMoney(movement.totalCostKgs ?? 0));
  const reconciledTotals = reconcileLineTotalsToAuthoritativeOrderTotal(
    previousTotals,
    roundDisplayMoney(authoritativeOrderTotalKgs ?? 0),
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
