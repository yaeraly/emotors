/**
 * Integration-style test: procurement receive reconciliation + balance recompute.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StockMovementType } from '@prisma/client';
import { recomputeInventoryBalanceValuation } from '../inventory/inventory-balance-valuation.util';
import {
  planProcurementReceiveInventoryReconciliation,
  sumReceiveMovementTotals,
} from '../procurement/procurement-receive-inventory-reconcile.util';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

const CHINA_BATCH_PRODUCT_COST_TOTAL = 914369.8;

function buildRepresentativeReceiveMovements() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const driftedLineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_PRODUCT_COST_TOTAL).map(
    (total) => roundDisplayMoney(total - 0.01),
  );

  return driftedLineTotals.map((totalCostKgs, index) => ({
    movementId: `mov-${index}`,
    productId: `prod-${index}`,
    warehouseId: 'wh-hq',
    branchId: 'branch-hq',
    quantity,
    totalCostKgs,
  }));
}

describe('procurement receive inventory parity workflow', () => {
  it('reconciles drifted movements and balance valuation to exact purchase total', () => {
    const snapshots = buildRepresentativeReceiveMovements();
    const driftedSum = sumReceiveMovementTotals(snapshots);
    assert.notEqual(driftedSum, CHINA_BATCH_PRODUCT_COST_TOTAL);

    const plan = planProcurementReceiveInventoryReconciliation(
      snapshots,
      CHINA_BATCH_PRODUCT_COST_TOTAL,
    );
    const reconciledMovements = plan.map((row) => ({
      id: row.movementId,
      type: StockMovementType.IN,
      quantity: row.quantity,
      unitCostKgs: row.reconciledUnitCostKgs,
      totalCostKgs: row.reconciledTotalCostKgs,
      createdAt: new Date(2026, 0, 1),
    }));

    const movementSum = sumReceiveMovementTotals(
      reconciledMovements.map((row) => ({ totalCostKgs: row.totalCostKgs })),
    );
    assert.equal(movementSum, CHINA_BATCH_PRODUCT_COST_TOTAL);

    let inventoryTotal = 0;
    for (const movement of reconciledMovements) {
      const valuation = recomputeInventoryBalanceValuation([movement]);
      inventoryTotal = roundDisplayMoney(inventoryTotal + valuation.totalValueKgs);
    }
    assert.equal(inventoryTotal, CHINA_BATCH_PRODUCT_COST_TOTAL);
    assert.equal(roundDisplayMoney(CHINA_BATCH_PRODUCT_COST_TOTAL - inventoryTotal), 0);
  });
});
