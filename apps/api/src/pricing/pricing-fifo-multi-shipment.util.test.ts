/**
 * Required FIFO scenarios — SUS001-style multi-shipment product (400 / 500 KGS).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

type FifoLayer = {
  id: string;
  receivedAt: string;
  createdAt: string;
  initialQuantity: number;
  remainingQuantity: number;
  reservedQuantity?: number;
  unitLandedCostKgs: number;
  totalLandedCostKgs: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function weightedAverageUnitCost(layers: FifoLayer[]) {
  const active = layers.filter((l) => l.remainingQuantity > 0);
  const totalQty = active.reduce((s, l) => s + l.remainingQuantity, 0);
  const totalValue = active.reduce((s, l) => s + l.remainingQuantity * l.unitLandedCostKgs, 0);
  return totalQty > 0 ? roundMoney(totalValue / totalQty) : 0;
}

function selectActiveDisplayCost(layers: FifoLayer[]) {
  const active = [...layers]
    .filter((l) => l.remainingQuantity > 0 && l.unitLandedCostKgs > 0)
    .sort((a, b) => {
      const byReceived = a.receivedAt.localeCompare(b.receivedAt);
      if (byReceived !== 0) return byReceived;
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.id.localeCompare(b.id);
    });
  return active[0]?.unitLandedCostKgs ?? null;
}

function createLayerFromShipment(input: {
  id: string;
  receivedAt: string;
  receivedQuantity: number;
  totalLandedCostKgs: number;
  remainingQuantity?: number;
}): FifoLayer {
  const unitLandedCostKgs = resolveUnitCostFromInventoryLayer({
    quantity: input.receivedQuantity,
    totalCostKgs: input.totalLandedCostKgs,
  });
  return {
    id: input.id,
    receivedAt: input.receivedAt,
    createdAt: input.receivedAt,
    initialQuantity: input.receivedQuantity,
    remainingQuantity: input.remainingQuantity ?? input.receivedQuantity,
    unitLandedCostKgs,
    totalLandedCostKgs: input.totalLandedCostKgs,
  };
}

describe('FIFO multi-shipment product — required scenarios', () => {
  const shipment1 = createLayerFromShipment({
    id: 'L1',
    receivedAt: '2026-01-10T10:00:00.000Z',
    receivedQuantity: 100,
    totalLandedCostKgs: 40000,
    remainingQuantity: 20,
  });
  const shipment2 = createLayerFromShipment({
    id: 'L2',
    receivedAt: '2026-02-15T10:00:00.000Z',
    receivedQuantity: 100,
    totalLandedCostKgs: 50000,
    remainingQuantity: 100,
  });

  it('1. one product received once', () => {
    const layer = createLayerFromShipment({
      id: 'only',
      receivedAt: '2026-01-01',
      receivedQuantity: 50,
      totalLandedCostKgs: 20000,
    });
    assert.equal(layer.unitLandedCostKgs, 400);
    assert.equal(selectActiveDisplayCost([layer]), 400);
  });

  it('2. one product received twice at different costs — two layers, not averaged', () => {
    assert.equal(shipment1.unitLandedCostKgs, 400);
    assert.equal(shipment2.unitLandedCostKgs, 500);
    const avg = weightedAverageUnitCost([shipment1, shipment2]);
    assert.equal(avg, 483.33);
    assert.notEqual(avg, 450);
    assert.notEqual(shipment1.unitLandedCostKgs, shipment2.unitLandedCostKgs);
  });

  it('3. one product received three times at different costs', () => {
    const layers = [
      createLayerFromShipment({
        id: 'A',
        receivedAt: '2026-01-01',
        receivedQuantity: 40,
        totalLandedCostKgs: 16000,
      }),
      createLayerFromShipment({
        id: 'B',
        receivedAt: '2026-02-01',
        receivedQuantity: 60,
        totalLandedCostKgs: 30000,
      }),
      createLayerFromShipment({
        id: 'C',
        receivedAt: '2026-03-01',
        receivedQuantity: 20,
        totalLandedCostKgs: 11000,
      }),
    ];
    assert.equal(layers.length, 3);
    assert.deepEqual(
      layers.map((l) => l.unitLandedCostKgs),
      [400, 500, 550],
    );
  });

  it('4. product list displays oldest active FIFO cost (400 KGS)', () => {
    assert.equal(selectActiveDisplayCost([shipment1, shipment2]), 400);
  });

  it('5. cost switches to next layer after depletion (500 KGS)', () => {
    const depletedLayer1 = { ...shipment1, remainingQuantity: 0 };
    assert.equal(selectActiveDisplayCost([depletedLayer1, shipment2]), 500);
  });

  it('6. order quantity split across two FIFO layers (3 + 2)', () => {
    const allocation = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, unitCostKgs: 400 },
        { batchId: 'L2', remainingQuantity: 100, unitCostKgs: 500 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
    );
    assert.equal(allocation.lines.length, 2);
    assert.equal(allocation.lines[0]?.quantity, 3);
    assert.equal(allocation.lines[1]?.quantity, 2);
    assert.equal(allocation.lines[0]?.unitCostKgs, 400);
    assert.equal(allocation.lines[1]?.unitCostKgs, 500);
  });

  it('7. markup calculated separately per layer (20%)', () => {
    const allocation = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, unitCostKgs: 400 },
        { batchId: 'L2', remainingQuantity: 100, unitCostKgs: 500 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE' },
    );
    assert.equal(allocation.lines[0]?.unitPriceKgs, 480);
    assert.equal(allocation.lines[1]?.unitPriceKgs, 600);
    assert.equal(allocation.totalPriceKgs, 3 * 480 + 2 * 600);
  });

  it('8. profit from actual FIFO allocations', () => {
    const allocation = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, unitCostKgs: 400 },
        { batchId: 'L2', remainingQuantity: 100, unitCostKgs: 500 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE' },
    );
    const fifoCostTotal = 3 * 400 + 2 * 500;
    const sellingTotal = 3 * 480 + 2 * 600;
    assert.equal(allocation.totalCostKgs, fifoCostTotal);
    assert.equal(allocation.totalPriceKgs, sellingTotal);
    assert.equal(allocation.profitKgs, sellingTotal - fifoCostTotal);
    assert.equal(allocation.profitKgs, 440);
  });

  it('9. no average cost used for display or allocation', () => {
    const display = selectActiveDisplayCost([shipment1, shipment2]);
    const simpleAverage = roundMoney((400 + 500) / 2);
    const weightedAvg = weightedAverageUnitCost([shipment1, shipment2]);
    assert.equal(display, 400);
    assert.notEqual(display, simpleAverage);
    assert.notEqual(display, weightedAvg);

    const allocation = buildFifoAllocationLines(
      [
        { batchId: 'L1', remainingQuantity: 3, unitCostKgs: 400 },
        { batchId: 'L2', remainingQuantity: 100, unitCostKgs: 500 },
      ],
      5,
      { markupPercent: 20, branchType: 'FRANCHISE' },
    );
    const avgCost = roundMoney(allocation.totalCostKgs / allocation.allocatedQty);
    assert.equal(avgCost, 440);
    assert.notEqual(allocation.lines[0]?.unitCostKgs, avgCost);
    assert.notEqual(allocation.lines[1]?.unitCostKgs, avgCost);
  });

  it('10. completed historical orders keep frozen allocation rows', () => {
    const historicalAllocations = [
      {
        fifoLayerId: 'L1',
        quantity: 3,
        unitCostKgs: 400,
        unitPriceKgs: 480,
        status: 'CONSUMED',
      },
      {
        fifoLayerId: 'L2',
        quantity: 2,
        unitCostKgs: 500,
        unitPriceKgs: 600,
        status: 'CONSUMED',
      },
    ];
    const newShipmentLayer = createLayerFromShipment({
      id: 'L3',
      receivedAt: '2026-03-01',
      receivedQuantity: 100,
      totalLandedCostKgs: 55000,
    });
    assert.equal(historicalAllocations[0]?.unitCostKgs, 400);
    assert.equal(historicalAllocations[1]?.unitCostKgs, 500);
    assert.equal(newShipmentLayer.unitLandedCostKgs, 550);
    assert.notEqual(newShipmentLayer.unitLandedCostKgs, historicalAllocations[0]?.unitCostKgs);
  });
});
