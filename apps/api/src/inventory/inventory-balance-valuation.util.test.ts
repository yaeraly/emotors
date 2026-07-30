import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StockMovementType } from '@prisma/client';
import { recomputeInventoryBalanceValuation, clampValuationForZeroQuantity } from './inventory-balance-valuation.util';

describe('recomputeInventoryBalanceValuation', () => {
  it('sums authoritative IN movement line totals without unit×qty drift', () => {
    const lineTotals = [14756.12, 14756.13, 14756.11];
    const movements = lineTotals.map((totalCostKgs, index) => ({
      id: `m-${index}`,
      type: StockMovementType.IN,
      quantity: 11,
      unitCostKgs: Math.round((totalCostKgs / 11) * 100) / 100,
      totalCostKgs,
      createdAt: new Date(2026, 0, index + 1),
    }));

    const valuation = recomputeInventoryBalanceValuation(movements);
    assert.equal(valuation.totalValueKgs, 44268.36);
    assert.notEqual(
      valuation.totalValueKgs,
      movements.reduce((sum, row) => sum + Number(row.unitCostKgs) * 11, 0),
    );
  });

  it('tracks OUT using stored movement totalCostKgs', () => {
    const valuation = recomputeInventoryBalanceValuation([
      {
        id: 'in-1',
        type: StockMovementType.IN,
        quantity: 10,
        unitCostKgs: 100,
        totalCostKgs: 1000,
        createdAt: new Date(2026, 0, 1),
      },
      {
        id: 'out-1',
        type: StockMovementType.OUT,
        quantity: -3,
        unitCostKgs: 100,
        totalCostKgs: 300,
        createdAt: new Date(2026, 0, 2),
      },
    ]);
    assert.equal(valuation.totalValueKgs, 700);
    assert.equal(valuation.averageCostKgs, 100);
  });

  it('zero-quantity adjustment with value only does not persist ghost value after clamp', () => {
    const valuation = recomputeInventoryBalanceValuation([
      {
        id: 'in-1',
        type: StockMovementType.IN,
        quantity: 10,
        unitCostKgs: 100,
        totalCostKgs: 1000,
        createdAt: new Date(2026, 0, 1),
      },
      {
        id: 'out-1',
        type: StockMovementType.OUT,
        quantity: -10,
        unitCostKgs: 100,
        totalCostKgs: 1000,
        createdAt: new Date(2026, 0, 2),
      },
      {
        id: 'adj-1',
        type: StockMovementType.INVENTORY_ADJUSTMENT_OUT,
        quantity: 0,
        unitCostKgs: 0,
        totalCostKgs: 90743.06,
        createdAt: new Date(2026, 0, 3),
      },
    ]);
    const clamped = clampValuationForZeroQuantity(0, valuation);
    assert.equal(clamped.totalValueKgs, 0);
  });
});
