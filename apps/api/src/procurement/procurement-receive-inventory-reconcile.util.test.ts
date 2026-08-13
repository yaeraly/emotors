import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from './landed-cost-allocation.util';
import {
  planProcurementReceiveInventoryReconciliation,
  reconcileLineTotalsToAuthoritativeOrderTotal,
  sumReceiveMovementTotals,
} from './procurement-receive-inventory-reconcile.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

const CHINA_BATCH_PRODUCT_COST_TOTAL = 914369.8;

function buildRepresentativeReceiveMovements() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_PRODUCT_COST_TOTAL);

  return lineTotals.map((totalCostKgs, index) => ({
    movementId: `mov-${index}`,
    productId: `prod-${index}`,
    warehouseId: 'wh-1',
    branchId: 'branch-hq',
    quantity,
    totalCostKgs,
  }));
}

describe('procurement receive inventory reconciliation', () => {
  it('reconciles 914369.80 batch line totals to exact order total', () => {
    const movements = buildRepresentativeReceiveMovements();
    const plan = planProcurementReceiveInventoryReconciliation(
      movements,
      CHINA_BATCH_PRODUCT_COST_TOTAL,
    );
    const reconciledSum = sumReceiveMovementTotals(
      plan.map((row) => ({ totalCostKgs: row.reconciledTotalCostKgs })),
    );
    assert.equal(reconciledSum, CHINA_BATCH_PRODUCT_COST_TOTAL);
  });

  it('simulates per-line roundMoney drift then reconciles to zero difference', () => {
    const movements = buildRepresentativeReceiveMovements();
    const drifted = movements.map((movement) => ({
      ...movement,
      totalCostKgs: roundDisplayMoney(movement.totalCostKgs - 0.01),
    }));
    const driftedSum = sumReceiveMovementTotals(drifted);
    assert.notEqual(driftedSum, CHINA_BATCH_PRODUCT_COST_TOTAL);

    const plan = planProcurementReceiveInventoryReconciliation(
      drifted,
      CHINA_BATCH_PRODUCT_COST_TOTAL,
    );
    const reconciledSum = sumReceiveMovementTotals(
      plan.map((row) => ({ totalCostKgs: row.reconciledTotalCostKgs })),
    );
    assert.equal(reconciledSum, CHINA_BATCH_PRODUCT_COST_TOTAL);
    assert.ok(plan.some((row) => row.deltaKgs !== 0));
  });

  it('assigns remainder to last line when raw shares do not sum to target', () => {
    const reconciled = reconcileLineTotalsToAuthoritativeOrderTotal([10, 20, 30.01], 60);
    assert.deepEqual(reconciled, [10, 20, 30]);
    assert.equal(sumReceiveMovementTotals(reconciled.map((totalCostKgs) => ({ totalCostKgs }))), 60);
  });
});
