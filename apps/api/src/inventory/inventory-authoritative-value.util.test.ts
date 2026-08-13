import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StockMovementType } from '@prisma/client';
import {
  clampValuationForZeroQuantity,
  recomputeInventoryBalanceValuation,
} from './inventory-balance-valuation.util';
import { roundDisplayMoney } from '../pricing/product-cost-precision.util';

const TWO_SHIPMENT_LANDED_TOTAL = 1736406;
const REPORTED_SHORTAGE_TOTAL = 1827149.06;
const UNEXPLAINED_DIFFERENCE = roundDisplayMoney(REPORTED_SHORTAGE_TOTAL - TWO_SHIPMENT_LANDED_TOTAL);

describe('inventory authoritative valuation', () => {
  it('clampValuationForZeroQuantity removes ghost value on zero-quantity balances', () => {
    const inflated = {
      totalValueKgs: UNEXPLAINED_DIFFERENCE,
      averageCostKgs: 120.5,
      landedCostKgs: 130.25,
    };
    const clamped = clampValuationForZeroQuantity(0, inflated);
    assert.equal(clamped.totalValueKgs, 0);
    assert.equal(clamped.averageCostKgs, 0);
    assert.equal(clamped.landedCostKgs, 130.25);
  });

  it('two China shipment movement totals reconcile to 1 736 406.00 KGS', () => {
    const shipmentTotals = [868203, 868203];
    const movements = shipmentTotals.map((totalCostKgs, index) => ({
      id: `shipment-${index + 1}`,
      type: StockMovementType.IN,
      quantity: 1000,
      unitCostKgs: roundDisplayMoney(totalCostKgs / 1000),
      totalCostKgs,
      createdAt: new Date(2026, 0, index + 1),
    }));

    const valuation = recomputeInventoryBalanceValuation(movements);
    assert.equal(valuation.totalValueKgs, TWO_SHIPMENT_LANDED_TOTAL);
    assert.equal(UNEXPLAINED_DIFFERENCE, 90743.06);
  });

  it('unit×qty shortage inflates write-off vs authoritative FIFO layer totals', () => {
    const lineTotals = [14756.12, 14756.13, 14756.11];
    const movements = lineTotals.map((totalCostKgs, index) => ({
      id: `m-${index}`,
      type: StockMovementType.IN,
      quantity: 11,
      unitCostKgs: Math.round((totalCostKgs / 11) * 100) / 100,
      totalCostKgs,
      createdAt: new Date(2026, 0, index + 1),
    }));

    const authoritativeTotal = recomputeInventoryBalanceValuation(movements).totalValueKgs;
    const inflatedShortage = movements.reduce(
      (sum, row) => sum + Number(row.unitCostKgs) * 11,
      0,
    );
    assert.equal(authoritativeTotal, 44268.36);
    assert.notEqual(roundDisplayMoney(inflatedShortage), authoritativeTotal);
  });

  it('zero-qty adjustment ghost value explains 90 743.06 KGS inflation path', () => {
    const valuation = recomputeInventoryBalanceValuation([
      {
        id: 'in-1',
        type: StockMovementType.IN,
        quantity: 1000,
        unitCostKgs: 868.203,
        totalCostKgs: 868203,
        createdAt: new Date(2026, 0, 1),
      },
      {
        id: 'in-2',
        type: StockMovementType.IN,
        quantity: 1000,
        unitCostKgs: 868.203,
        totalCostKgs: 868203,
        createdAt: new Date(2026, 0, 2),
      },
      {
        id: 'ghost-adj',
        type: StockMovementType.INVENTORY_ADJUSTMENT_OUT,
        quantity: 0,
        unitCostKgs: 0,
        totalCostKgs: UNEXPLAINED_DIFFERENCE,
        createdAt: new Date(2026, 0, 3),
      },
    ]);

    const ghostInflatedShortage = valuation.totalValueKgs;
    assert.equal(ghostInflatedShortage, REPORTED_SHORTAGE_TOTAL);
    const clamped = clampValuationForZeroQuantity(0, valuation);
    assert.equal(clamped.totalValueKgs, 0);
    assert.equal(roundDisplayMoney(ghostInflatedShortage - TWO_SHIPMENT_LANDED_TOTAL), UNEXPLAINED_DIFFERENCE);
  });
});
