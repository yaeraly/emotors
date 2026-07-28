/**
 * End-to-end cost parity: China procurement batch → HQ receive → FIFO → branch sales order.
 * Verifies authoritative line totals are preserved (no unit×qty drift).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { resolveMovementCostUpdates } from '../procurement/landed-cost-sync-movements.util';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';

const CHINA_BATCH_PRODUCT_COST_TOTAL = 914369.8;

function buildRepresentativeChinaBatchLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_PRODUCT_COST_TOTAL);
  return lineTotals.map((totalCostKgs, index) => ({
    batchId: `batch-${index}`,
    sku: `SKU-${index}`,
    totalCostKgs,
    quantity,
  }));
}

function legacyUnitTimesQtyTotal(
  lines: Array<{ totalCostKgs: number; quantity: number }>,
) {
  return roundDisplayMoney(
    lines.reduce((sum, line) => {
      const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
      return sum + unit * line.quantity;
    }, 0),
  );
}

function simulateHqReceive(lines: Array<{ totalCostKgs: number; quantity: number; batchId: string }>) {
  return lines.map((line) => {
    const movementTotal = roundDisplayMoney(line.totalCostKgs);
    const unitCostKgs = resolveUnitCostFromInventoryLayer({
      quantity: line.quantity,
      totalCostKgs: movementTotal,
    });
    return {
      batchId: line.batchId,
      movementId: `mov-${line.batchId}`,
      quantity: line.quantity,
      totalCostKgs: movementTotal,
      unitCostKgs,
    };
  });
}

function simulateFifoLayers(
  movements: Array<{
    batchId: string;
    movementId: string;
    quantity: number;
    totalCostKgs: number;
    unitCostKgs: number;
  }>,
) {
  return movements.map((movement) => ({
    batchId: movement.batchId,
    remainingQuantity: movement.quantity,
    reservedQuantity: 0,
    unitCostKgs: movement.unitCostKgs,
    layerTotalCostKgs: movement.totalCostKgs,
    layerBaseQuantity: movement.quantity,
    wholesalePriceKgs: movement.unitCostKgs,
    hqBranchWholesalePriceKgs: movement.unitCostKgs,
  }));
}

function simulateBranchSalesOrder(
  layers: ReturnType<typeof simulateFifoLayers>,
  quantity: number,
) {
  return buildFifoAllocationLines(layers, quantity, {
    markupPercent: 0,
    branchType: 'HQ_BRANCH',
    subtractReserved: false,
  });
}

describe('China batch cost workflow — 914369.80 KGS parity', () => {
  const procurementLines = buildRepresentativeChinaBatchLines();

  it('China batch product cost total equals 914369.80', () => {
    const batchTotal = sumDisplayMoneyTotals(procurementLines.map((line) => line.totalCostKgs));
    assert.equal(batchTotal, CHINA_BATCH_PRODUCT_COST_TOTAL);
  });

  it('HQ received inventory preserves authoritative line totals', () => {
    const movements = simulateHqReceive(procurementLines);
    const hqReceivedTotal = sumDisplayMoneyTotals(movements.map((row) => row.totalCostKgs));
    assert.equal(hqReceivedTotal, CHINA_BATCH_PRODUCT_COST_TOTAL);
    let driftLineCount = 0;
    for (const movement of movements) {
      const unitTimesQty = roundDisplayMoney(movement.unitCostKgs * movement.quantity);
      if (unitTimesQty !== movement.totalCostKgs) driftLineCount += 1;
    }
    assert.ok(driftLineCount > 0, 'expected some lines where unit×qty ≠ authoritative total');
  });

  it('FIFO allocation per line matches movement landed totals', () => {
    const movements = simulateHqReceive(procurementLines);
    const layers = simulateFifoLayers(movements);
    let fifoTotal = 0;
    for (const line of procurementLines) {
      const layer = layers.find((row) => row.batchId === line.batchId)!;
      const allocation = simulateBranchSalesOrder([layer], line.quantity);
      assert.equal(allocation.allocatedQty, line.quantity);
      assert.equal(allocation.totalCostKgs, line.totalCostKgs);
      fifoTotal += allocation.totalCostKgs;
    }
    assert.equal(roundDisplayMoney(fifoTotal), CHINA_BATCH_PRODUCT_COST_TOTAL);
  });

  it('branch sales authoritative line-sum matches procurement (not unit×qty)', () => {
    const movements = simulateHqReceive(procurementLines);
    const layers = simulateFifoLayers(movements);
    const branchLineCosts = procurementLines.map((line) => {
      const layer = layers.find((row) => row.batchId === line.batchId)!;
      return simulateBranchSalesOrder([layer], line.quantity).totalCostKgs;
    });
    const branchSalesTotal = sumDisplayMoneyTotals(branchLineCosts);
    const legacyTotal = legacyUnitTimesQtyTotal(procurementLines);

    assert.equal(branchSalesTotal, CHINA_BATCH_PRODUCT_COST_TOTAL);
    assert.notEqual(branchSalesTotal, legacyTotal);
  });

  it('movement sync keeps procurement line total for single-shipment lines', () => {
    const line = procurementLines.find(
      (row) =>
        roundDisplayMoney(deriveDisplayUnitCost(row.totalCostKgs, row.quantity) * row.quantity) <
        row.totalCostKgs,
    )!;
    const unit = deriveDisplayUnitCost(line.totalCostKgs, line.quantity);
    const updates = resolveMovementCostUpdates({
      orderLineFinalUnitCostKgs: unit,
      orderLineTotalCostKgs: line.totalCostKgs,
      movements: [
        {
          id: 'm1',
          quantity: line.quantity,
          totalCostKgs: line.totalCostKgs,
          unitCostKgs: unit,
        },
      ],
    });
    assert.equal(updates[0]?.totalCostKgs, line.totalCostKgs);
  });

  it('full workflow difference is exactly 0.00 KGS', () => {
    const batchTotal = sumDisplayMoneyTotals(procurementLines.map((line) => line.totalCostKgs));
    const movements = simulateHqReceive(procurementLines);
    const hqTotal = sumDisplayMoneyTotals(movements.map((row) => row.totalCostKgs));
    const layers = simulateFifoLayers(movements);
    const branchTotal = sumDisplayMoneyTotals(
      procurementLines.map((line) => {
        const layer = layers.find((row) => row.batchId === line.batchId)!;
        return simulateBranchSalesOrder([layer], line.quantity).totalCostKgs;
      }),
    );

    assert.equal(roundDisplayMoney(batchTotal - hqTotal), 0);
    assert.equal(roundDisplayMoney(batchTotal - branchTotal), 0);
    assert.equal(roundDisplayMoney(hqTotal - branchTotal), 0);
  });
});
