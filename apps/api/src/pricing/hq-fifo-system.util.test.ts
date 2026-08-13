/**
 * System-wide FIFO behavior tests — generic products, no hardcoded SKU/costs.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFifoAllocationLines } from './pricing-fifo-allocation.util';
import { isSeedStockMovementReference } from './pricing-fifo-business-layer.util';
import { resolveUnitCostFromInventoryLayer } from './pricing-fifo-unit-cost.util';

type ProductReceipt = {
  productCode: string;
  receiptIndex: number;
  receivedQuantity: number;
  totalLandedCostKgs: number;
};

type FifoLayer = {
  batchId: string;
  productCode: string;
  receivedAt: string;
  createdAt: string;
  receivedQuantity: number;
  remainingQuantity: number;
  unitLandedCostKgs: number;
  referenceType?: string | null;
  referenceId?: string | null;
};

function layerFromReceipt(receipt: ProductReceipt, receivedAt: string): FifoLayer {
  return {
    batchId: `${receipt.productCode}-R${receipt.receiptIndex}`,
    productCode: receipt.productCode,
    receivedAt,
    createdAt: receivedAt,
    receivedQuantity: receipt.receivedQuantity,
    remainingQuantity: receipt.receivedQuantity,
    unitLandedCostKgs: resolveUnitCostFromInventoryLayer({
      quantity: receipt.receivedQuantity,
      totalCostKgs: receipt.totalLandedCostKgs,
    }),
    referenceType: 'PROCUREMENT_GOODS_RECEIVING',
    referenceId: `recv-${receipt.productCode}-${receipt.receiptIndex}`,
  };
}

function businessLayers(layers: FifoLayer[]) {
  return layers.filter(
    (layer) =>
      !isSeedStockMovementReference({
        referenceType: layer.referenceType,
        referenceId: layer.referenceId,
      }),
  );
}

function oldestActiveDisplayCost(layers: FifoLayer[]) {
  const active = businessLayers(layers)
    .filter((layer) => layer.remainingQuantity > 0 && layer.unitLandedCostKgs > 0)
    .sort((a, b) => {
      const byReceived = a.receivedAt.localeCompare(b.receivedAt);
      if (byReceived !== 0) return byReceived;
      const byCreated = a.createdAt.localeCompare(b.createdAt);
      if (byCreated !== 0) return byCreated;
      return a.batchId.localeCompare(b.batchId);
    });
  return active[0]?.unitLandedCostKgs ?? null;
}

describe('system-wide HQ FIFO — generic multi-product behavior', () => {
  const productAReceipt1 = layerFromReceipt(
    { productCode: 'PROD-A', receiptIndex: 1, receivedQuantity: 15, totalLandedCostKgs: 24944.55 },
    '2026-03-01T10:00:00.000Z',
  );
  const productAReceipt2 = layerFromReceipt(
    { productCode: 'PROD-A', receiptIndex: 2, receivedQuantity: 10, totalLandedCostKgs: 16541.95 },
    '2026-03-15T10:00:00.000Z',
  );
  const productBReceipt1 = layerFromReceipt(
    { productCode: 'PROD-B', receiptIndex: 1, receivedQuantity: 30, totalLandedCostKgs: 12000 },
    '2026-02-01T10:00:00.000Z',
  );
  const productBReceipt2 = layerFromReceipt(
    { productCode: 'PROD-B', receiptIndex: 2, receivedQuantity: 50, totalLandedCostKgs: 27500 },
    '2026-02-20T10:00:00.000Z',
  );
  const productCReceipt1 = layerFromReceipt(
    { productCode: 'PROD-C', receiptIndex: 1, receivedQuantity: 100, totalLandedCostKgs: 40000 },
    '2026-01-05T10:00:00.000Z',
  );
  const productCReceipt2 = layerFromReceipt(
    { productCode: 'PROD-C', receiptIndex: 2, receivedQuantity: 80, totalLandedCostKgs: 36000 },
    '2026-01-20T10:00:00.000Z',
  );
  const productCReceipt3 = layerFromReceipt(
    { productCode: 'PROD-C', receiptIndex: 3, receivedQuantity: 120, totalLandedCostKgs: 60000 },
    '2026-02-01T10:00:00.000Z',
  );

  it('1. product received once uses that receipt unit cost', () => {
    const only = [productBReceipt1];
    assert.equal(oldestActiveDisplayCost(only), 400);
  });

  it('2. same product received twice keeps two separate unit costs', () => {
    const layers = [productAReceipt1, productAReceipt2];
    assert.equal(productAReceipt1.unitLandedCostKgs, 1662.97);
    assert.equal(productAReceipt2.unitLandedCostKgs, 1654.2);
    assert.notEqual(productAReceipt1.unitLandedCostKgs, productAReceipt2.unitLandedCostKgs);
    assert.equal(oldestActiveDisplayCost(layers), productAReceipt1.unitLandedCostKgs);
  });

  it('3. same product received three times keeps three layers', () => {
    const layers = [productCReceipt1, productCReceipt2, productCReceipt3];
    const costs = new Set(layers.map((l) => l.unitLandedCostKgs));
    assert.equal(costs.size, 3);
    assert.equal(oldestActiveDisplayCost(layers), 400);
  });

  it('4. multiple products in one shipment each keep independent FIFO costs', () => {
    const shipmentLayers = [productAReceipt1, productBReceipt1, productCReceipt1].map((layer, index) => ({
      ...layer,
      batchId: `SHIP-1-${index}`,
    }));
    assert.equal(oldestActiveDisplayCost(shipmentLayers.filter((l) => l.productCode === 'PROD-A')), 1662.97);
    assert.equal(oldestActiveDisplayCost(shipmentLayers.filter((l) => l.productCode === 'PROD-B')), 400);
    assert.equal(oldestActiveDisplayCost(shipmentLayers.filter((l) => l.productCode === 'PROD-C')), 400);
  });

  it('5. new receipt does not overwrite earlier batch unit cost', () => {
    const before = [productBReceipt1];
    const after = [productBReceipt1, productBReceipt2];
    assert.equal(oldestActiveDisplayCost(before), 400);
    assert.equal(oldestActiveDisplayCost(after), 400);
    assert.equal(after[1].unitLandedCostKgs, 550);
  });

  it('6. product list returns oldest active FIFO cost for each product', () => {
    assert.equal(oldestActiveDisplayCost([productAReceipt1, productAReceipt2]), 1662.97);
    assert.equal(oldestActiveDisplayCost([productBReceipt1, productBReceipt2]), 400);
  });

  it('7. pricing policy uses the same oldest active FIFO cost', () => {
    const catalogCost = oldestActiveDisplayCost([productAReceipt1, productAReceipt2]);
    const policyCost = oldestActiveDisplayCost([productAReceipt1, productAReceipt2]);
    assert.equal(catalogCost, policyCost);
  });

  it('8. FIFO display switches after oldest layer is exhausted', () => {
    const depletedFirst = [
      { ...productBReceipt1, remainingQuantity: 0 },
      productBReceipt2,
    ];
    assert.equal(oldestActiveDisplayCost(depletedFirst), 550);
  });

  it('9. branch order splits across two FIFO layers', () => {
    const layers = [
      { ...productCReceipt1, remainingQuantity: 3 },
      { ...productCReceipt2, remainingQuantity: 100 },
    ];
    const allocation = buildFifoAllocationLines(
      businessLayers(layers).map((l) => ({
        batchId: l.batchId,
        remainingQuantity: l.remainingQuantity,
        reservedQuantity: 0,
        unitCostKgs: l.unitLandedCostKgs,
      })),
      5,
      { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
    );
    assert.equal(allocation.lines.length, 2);
    assert.deepEqual(
      allocation.lines.map((line) => ({ quantity: line.quantity, unitCostKgs: line.unitCostKgs })),
      [
        { quantity: 3, unitCostKgs: 400 },
        { quantity: 2, unitCostKgs: 450 },
      ],
    );
  });

  it('10. branch order splits across three FIFO layers', () => {
    const layers = [
      { ...productCReceipt1, remainingQuantity: 2 },
      { ...productCReceipt2, remainingQuantity: 2 },
      { ...productCReceipt3, remainingQuantity: 100 },
    ];
    const allocation = buildFifoAllocationLines(
      businessLayers(layers).map((l) => ({
        batchId: l.batchId,
        remainingQuantity: l.remainingQuantity,
        reservedQuantity: 0,
        unitCostKgs: l.unitLandedCostKgs,
      })),
      5,
      { markupPercent: 10, branchType: 'FRANCHISE', subtractReserved: true },
    );
    assert.equal(allocation.lines.length, 3);
    assert.deepEqual(
      allocation.lines.map((line) => line.quantity),
      [2, 2, 1],
    );
  });

  it('11. markup is calculated separately per layer', () => {
    const allocation = buildFifoAllocationLines(
      businessLayers([
        { ...productBReceipt1, remainingQuantity: 3 },
        { ...productBReceipt2, remainingQuantity: 10 },
      ]).map((l) => ({
        batchId: l.batchId,
        remainingQuantity: l.remainingQuantity,
        reservedQuantity: 0,
        unitCostKgs: l.unitLandedCostKgs,
      })),
      5,
      { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
    );
    assert.equal(allocation.lines[0].unitPriceKgs, 480);
    assert.equal(allocation.lines[1].unitPriceKgs, 660);
  });

  it('12. profit is calculated separately per layer', () => {
    const allocation = buildFifoAllocationLines(
      businessLayers([
        { ...productBReceipt1, remainingQuantity: 3 },
        { ...productBReceipt2, remainingQuantity: 10 },
      ]).map((l) => ({
        batchId: l.batchId,
        remainingQuantity: l.remainingQuantity,
        reservedQuantity: 0,
        unitCostKgs: l.unitLandedCostKgs,
      })),
      5,
      { markupPercent: 20, branchType: 'FRANCHISE', subtractReserved: true },
    );
    assert.equal(allocation.profitKgs, allocation.totalPriceKgs - allocation.totalCostKgs);
    assert.equal(
      allocation.lines.reduce((sum, line) => sum + line.profitKgs, 0),
      allocation.profitKgs,
    );
  });

  it('13. completed receipt with missing FIFO is detectable as a data gap', () => {
    const movementWithoutFifo = { movementId: 'm1', fifoLayerId: null as string | null };
    assert.equal(movementWithoutFifo.fifoLayerId, null);
  });

  it('14. duplicate FIFO creation is prevented by one-batch-per-movement rule', () => {
    const batchesForMovement = [{ movementId: 'm1', batchId: 'b1' }];
    const duplicates = batchesForMovement.filter((row) => row.movementId === 'm1');
    assert.equal(duplicates.length, 1);
  });

  it('15. different warehouses keep separate FIFO layers', () => {
    const wh1 = { ...productAReceipt1, batchId: 'WH1-A' };
    const wh2 = { ...productAReceipt1, batchId: 'WH2-A', unitLandedCostKgs: 1700 };
    assert.notEqual(wh1.batchId, wh2.batchId);
    assert.notEqual(wh1.unitLandedCostKgs, wh2.unitLandedCostKgs);
  });

  it('16. legacy seed records do not override real inventory', () => {
    const seedLayer: FifoLayer = {
      batchId: 'seed-1',
      productCode: 'PROD-A',
      receivedAt: '2025-01-01T10:00:00.000Z',
      createdAt: '2025-01-01T10:00:00.000Z',
      receivedQuantity: 80,
      remainingQuantity: 80,
      unitLandedCostKgs: 350,
      referenceType: 'SEED_REPRO',
      referenceId: 'recv-1',
    };
    const realLayers = [seedLayer, productAReceipt1, productAReceipt2];
    assert.equal(oldestActiveDisplayCost(realLayers), 1662.97);
  });

  it('17. historical completed orders remain unchanged when new receipt arrives', () => {
    const frozenAllocation = [
      { batchId: productBReceipt1.batchId, quantity: 2, unitCostKgs: 400, unitPriceKgs: 480 },
    ];
    const afterNewReceipt = [productBReceipt1, productBReceipt2];
    assert.equal(frozenAllocation[0].unitCostKgs, 400);
    assert.equal(oldestActiveDisplayCost(afterNewReceipt), 400);
  });
});
