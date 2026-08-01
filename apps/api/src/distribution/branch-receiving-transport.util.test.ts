import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allocateBranchReceivingTransportCost,
  assertPositiveUnitWeights,
  BRANCH_TRANSPORT_MISSING_WEIGHT_MESSAGE,
  collectMissingWeightProducts,
  sumAllocatedTransportCost,
} from './branch-receiving-transport.util';

describe('allocateBranchReceivingTransportCost', () => {
  it('allocates by received quantity × unit weight', () => {
    // Example from task: 10k over 200kg + 100kg
    const rows = allocateBranchReceivingTransportCost(
      [
        { productId: 'a', receivedQuantity: 10, weightKg: 20, unitCostKgs: 100, sku: 'A' },
        { productId: 'b', receivedQuantity: 20, weightKg: 5, unitCostKgs: 50, sku: 'B' },
      ],
      10000,
    );

    assert.equal(rows.find((row) => row.productId === 'a')?.itemTotalWeightKg, 200);
    assert.equal(rows.find((row) => row.productId === 'b')?.itemTotalWeightKg, 100);
    assert.equal(sumAllocatedTransportCost(rows), 10000);
    assert.equal(rows.find((row) => row.productId === 'a')?.transportExpenseAllocation, 6666.67);
    assert.equal(rows.find((row) => row.productId === 'b')?.transportExpenseAllocation, 3333.33);
  });

  it('assigns rounding remainder deterministically so totals match exactly', () => {
    const rows = allocateBranchReceivingTransportCost(
      [
        { productId: 'a', receivedQuantity: 3, weightKg: 1, unitCostKgs: 100 },
        { productId: 'b', receivedQuantity: 3, weightKg: 1, unitCostKgs: 100 },
        { productId: 'c', receivedQuantity: 3, weightKg: 1, unitCostKgs: 100 },
      ],
      100,
    );
    // 33.33 + 33.33 + 33.33 = 99.99 → remainder 0.01 to heaviest (tie → productId 'a')
    assert.equal(sumAllocatedTransportCost(rows), 100);
    const byId = Object.fromEntries(rows.map((row) => [row.productId, row.transportExpenseAllocation]));
    assert.equal(byId.a + byId.b + byId.c, 100);
    assert.equal(byId.a, 33.34);
    assert.equal(byId.b, 33.33);
    assert.equal(byId.c, 33.33);
  });

  it('accepts zero transport cost without fake allocations', () => {
    const rows = allocateBranchReceivingTransportCost(
      [
        { productId: 'a', receivedQuantity: 2, weightKg: 1, unitCostKgs: 100 },
        { productId: 'b', receivedQuantity: 1, weightKg: 2, unitCostKgs: 200 },
      ],
      0,
    );
    assert.equal(sumAllocatedTransportCost(rows), 0);
    assert.equal(rows.find((row) => row.productId === 'a')?.finalUnitCostKgs, 100);
    assert.equal(rows.find((row) => row.productId === 'b')?.finalUnitCostKgs, 200);
  });

  it('blocks missing product weight and does not fall back to quantity', () => {
    assert.throws(
      () =>
        allocateBranchReceivingTransportCost(
          [
            { productId: 'a', sku: 'SKU-A', productName: 'Alpha', receivedQuantity: 1, weightKg: 0, unitCostKgs: 50 },
            { productId: 'b', sku: 'SKU-B', productName: 'Beta', receivedQuantity: 3, weightKg: 1, unitCostKgs: 70 },
          ],
          100,
        ),
      (err: Error & { missingWeightProducts?: unknown[] }) => {
        assert.equal(err.message, BRANCH_TRANSPORT_MISSING_WEIGHT_MESSAGE);
        assert.ok(Array.isArray(err.missingWeightProducts));
        assert.equal(err.missingWeightProducts?.[0]?.productId, 'a');
        return true;
      },
    );
  });

  it('blocks negative product weight', () => {
    const missing = collectMissingWeightProducts([
      { productId: 'x', receivedQuantity: 1, weightKg: -1, unitCostKgs: 10 },
    ]);
    assert.equal(missing.length, 1);
    assert.throws(() => assertPositiveUnitWeights([
      { productId: 'x', receivedQuantity: 1, weightKg: -1, unitCostKgs: 10 },
    ]));
  });

  it('uses only actually received quantities (partial receiving)', () => {
    const rows = allocateBranchReceivingTransportCost(
      [
        { productId: 'a', receivedQuantity: 5, weightKg: 2, unitCostKgs: 100 },
        { productId: 'b', receivedQuantity: 0, weightKg: 10, unitCostKgs: 50 },
      ],
      100,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.productId, 'a');
    assert.equal(rows[0]?.transportExpenseAllocation, 100);
    assert.equal(sumAllocatedTransportCost(rows), 100);
  });

  it('final branch unit cost equals transfer cost plus allocated delivery cost', () => {
    const rows = allocateBranchReceivingTransportCost(
      [{ productId: 'a', receivedQuantity: 4, weightKg: 2.5, unitCostKgs: 80 }],
      40,
    );
    assert.equal(rows[0]?.transportCostPerUnit, 10);
    assert.equal(rows[0]?.finalUnitCostKgs, 90);
  });

  it('preview and final allocation use the same pure allocator (exact match)', () => {
    const lines = [
      { productId: 'p1', receivedQuantity: 7, weightKg: 3, unitCostKgs: 120, sku: 'P1' },
      { productId: 'p2', receivedQuantity: 2, weightKg: 11, unitCostKgs: 90, sku: 'P2' },
    ];
    const preview = allocateBranchReceivingTransportCost(lines, 1234.56);
    const final = allocateBranchReceivingTransportCost(lines, 1234.56);
    assert.deepEqual(preview, final);
    assert.equal(sumAllocatedTransportCost(final), 1234.56);
  });
});
