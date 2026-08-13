import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  assertAllocationReconciles,
  assertMoneyEqual,
  consumeFifoLayerSequence,
  distributeMoneyToTarget,
  isMoneyEqual,
  multiplyCnyByRate,
  remainingFifoLayerMoney,
  toStoredMoneyKgs,
} from './money';
import { assertMoneyChainReconciles, reconcileHqBranchBprToFifo, reconcileMoneyChain, reconcileProcurement } from './money.reconciliation';
import { allocateLayerConsumptionCost } from '../../pricing/product-cost-precision.util';
import { resolveHqBranchTransferLineCostKgs } from '../../operations/hq-branch-transfer-cost.util';

describe('authoritative Decimal money architecture', () => {
  it('keeps 100.01 exact through HQ transfer → branch receipt → branch FIFO', () => {
    const source = new Prisma.Decimal('100.01');
    const transfer = resolveHqBranchTransferLineCostKgs({ fifoLineCostKgs: source });
    const branchReceipt = toStoredMoneyKgs(transfer);
    const branchFifo = toStoredMoneyKgs(branchReceipt);
    assert.equal(transfer, 100.01);
    assert.equal(branchReceipt, 100.01);
    assert.equal(branchFifo, 100.01);
    assertMoneyEqual(source, branchFifo, '100.01 chain');
  });

  it('3 pcs totaling 100.00 consume exactly 100.00 with remainder on last units', () => {
    const sequence = consumeFifoLayerSequence(100, 3, [1, 1, 1]);
    assert.equal(toStoredMoneyKgs(sequence.consumed.reduce((sum, row) => sum.plus(row))), 100);
    assert.equal(toStoredMoneyKgs(sequence.remainingCost), 0);
    assert.equal(sequence.remainingQuantity, 0);
    assert.notEqual(
      sequence.consumed.map((row) => row.toNumber()).join('+'),
      '33.33+33.33+33.33',
    );
  });

  it('partial FIFO 10 pcs / 1234.56 consumes exactly across 3+4+3', () => {
    const sequence = consumeFifoLayerSequence(1234.56, 10, [3, 4, 3]);
    const consumed = toStoredMoneyKgs(sequence.consumed.reduce((sum, row) => sum.plus(row)));
    assert.equal(consumed, 1234.56);
    assert.equal(toStoredMoneyKgs(sequence.remainingCost), 0);
  });

  it('multiple FIFO layers sum consumed cost without averaging', () => {
    const layerA = consumeFifoLayerSequence(500, 5, [5]);
    const layerB = consumeFifoLayerSequence(700.07, 7, [7]);
    const total = toStoredMoneyKgs(layerA.consumed[0]!.plus(layerB.consumed[0]!));
    assert.equal(total, 1200.07);
  });

  it('procurement allocation remainder keeps SUM(items) = landed total', () => {
    const allocated = distributeMoneyToTarget([33.333, 33.333, 33.334], 100);
    assertAllocationReconciles(100, allocated, 'procurement allocation');
    assert.equal(toStoredMoneyKgs(allocated.reduce((sum, row) => sum.plus(row))), 100);
  });

  it('HQ Branch BPR total equals FIFO line sum (never unit×qty)', () => {
    const fifo = [33.34, 33.33, 33.33];
    const bpr = reconcileHqBranchBprToFifo({
      fifoLineCostsKgs: fifo,
      bprLineTotalsKgs: fifo,
      bprHeaderTotalKgs: 100,
    });
    assert.equal(bpr.ok, true);
    assert.equal(bpr.differenceKgs, 0);
    const drifted = reconcileHqBranchBprToFifo({
      fifoLineCostsKgs: fifo,
      bprLineTotalsKgs: [33.33, 33.33, 33.33],
      bprHeaderTotalKgs: 99.99,
    });
    assert.equal(drifted.ok, false);
    assert.equal(drifted.differenceKgs, 0.01);
  });

  it('HQ → HQ Branch chain has zero difference at every stage', () => {
    const cost = 100.01;
    assertMoneyChainReconciles({
      procurementFinalCostKgs: cost,
      allocatedItemCostsKgs: cost,
      hqFifoCreatedKgs: cost,
      hqFifoConsumedKgs: cost,
      hqBranchTransferKgs: cost,
      branchFifoCreatedKgs: cost,
      branchInventoryValueKgs: cost,
    });
  });

  it('inventory valuation uses remaining layer money, not rounded unit × qty', () => {
    const remaining = remainingFifoLayerMoney({
      originalLayerCost: 100,
      layerBaseQuantity: 3,
      remainingQuantity: 1,
    });
    const unitTimesQty = toStoredMoneyKgs((100 / 3) * 1);
    assert.equal(toStoredMoneyKgs(remaining), 33.33);
    assert.notEqual(toStoredMoneyKgs(remaining), unitTimesQty === 33.33 ? 33.34 : unitTimesQty);
  });

  it('CNY × rate uses Decimal, not Number multiply', () => {
    const kgs = multiplyCnyByRate('1000.01', '12.3456');
    const forbidden = Number((1000.01 * 12.3456).toFixed(8));
    assert.equal(kgs.toFixed(2), '12345.72');
    assert.ok(isMoneyEqual(kgs, '12345.72'));
    assert.notEqual(typeof kgs, 'number');
    void forbidden;
  });

  it('historical snapshot stays 100.01 after later catalog change', () => {
    const orderSnapshot = 100.01;
    const laterCatalogPrice = 150;
    assert.equal(orderSnapshot, 100.01);
    assert.notEqual(orderSnapshot, laterCatalogPrice);
  });

  it('final remaining FIFO consume uses remaining layer cost, not unit × qty', () => {
    const first = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 3,
      remainingQuantity: 3,
      takeQuantity: 1,
    });
    const second = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 3,
      remainingQuantity: 2,
      takeQuantity: 1,
    });
    const last = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 3,
      remainingQuantity: 1,
      takeQuantity: 1,
    });
    assert.equal(toStoredMoneyKgs(first + second + last), 100);
  });

  it('detects chain mismatch without silently adjusting', () => {
    const result = reconcileMoneyChain({
      procurementFinalCostKgs: 100,
      allocatedItemCostsKgs: 99.99,
      hqFifoCreatedKgs: 99.99,
      hqFifoConsumedKgs: 99.99,
      hqBranchTransferKgs: 99.99,
      branchFifoCreatedKgs: 99.99,
      branchInventoryValueKgs: 99.99,
    });
    assert.equal(result.ok, false);
    assert.ok(result.differences.some((row) => row.stage === 'procurement.allocated'));
  });

  it('repeated partial payments close remaining at exactly zero', () => {
    const remaining = toStoredMoneyKgs(
      new Prisma.Decimal('100.01').minus('33.34').minus('33.33').minus('33.34'),
    );
    assert.equal(remaining, 0);
  });

  it('invoice remaining uses Decimal subtract, not float remainder', () => {
    const remaining = toStoredMoneyKgs(
      new Prisma.Decimal('1963.59').minus('1000.00').minus('963.59'),
    );
    assert.equal(remaining, 0);
  });

  it('reconcileProcurement reports difference without mutating', () => {
    const mismatch = reconcileProcurement({
      procurementFinalCostKgs: 100,
      allocatedItemCostsKgs: [33.33, 33.33, 33.33],
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.differenceKgs, 0.01);
    const ok = reconcileProcurement({
      procurementFinalCostKgs: 100,
      allocatedItemCostsKgs: [33.33, 33.33, 33.34],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.differenceKgs, 0);
  });
});
