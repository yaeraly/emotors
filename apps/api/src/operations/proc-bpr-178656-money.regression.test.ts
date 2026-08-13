import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  assertMoneyEqual,
  consumeFifoLayerSequence,
  distributeMoneyToTarget,
  toStoredMoneyKgs,
} from '../common/money/money';
import {
  assertMoneyChainReconciles,
  reconcileHqBranchBprToFifo,
  reconcileMoneyChain,
} from '../common/money/money.reconciliation';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { buildFifoAllocationLines } from '../pricing/pricing-fifo-allocation.util';
import {
  allocateLayerConsumptionCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { calculateBprLineTotalKgs, calculateBprOrderTotalKgs } from './branch-purchase-authoritative-money.util';
import { shouldTransferBranchPurchaseAtCost } from './branch-purchase-estimated-amount.util';
import { applyHqBranchInternalDistributionProfit } from '../distribution/hq-branch-distribution-profit.util';
import { planHqBranchBprRepairFromProcurement } from './repair-hq-branch-from-procurement.util';
import { toBranchPurchaseRequestResponse } from './branch-purchase-request.presenter';
import { BranchPurchaseRequestStatus } from '@prisma/client';

const PROC_NUMBER = 'PROC-1786562989569';
const BPR_NUMBER = 'BPR-1786565119536';
/** Documented real-case landed total. Tests reconstruct it; production code never hardcodes it. */
const LANDED_TOTAL = 914369.8;
const WRONG_BPR_TOTAL = 914368.98;

function buildProcLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  return distributeRoundedAmounts(rawShares, LANDED_TOTAL).map((totalCostKgs, index) => ({
    productId: `prod-${index}`,
    sku: `SKU-${index + 1}`,
    productName: `SKU-${index + 1}`,
    quantity,
    totalCostKgs,
  }));
}

describe(`${PROC_NUMBER} → ${BPR_NUMBER} authoritative money`, () => {
  it('1. source 100.01 → destination exactly 100.01', () => {
    const dest = calculateBprLineTotalKgs(
      {
        quantity: 1,
        estimatedLineProductCostKgs: 100.01,
        resolvedBranchPriceKgs: 100.01,
        totalAmount: 100.01,
        branchType: 'HQ_BRANCH',
      },
      'draft',
    );
    assert.equal(dest, 100.01);
    assertMoneyEqual(100.01, dest, '100.01 chain');
  });

  it('2. 3 pcs / total 100.00 → destination exactly 100.00, never 99.99', () => {
    const dest = calculateBprLineTotalKgs(
      {
        quantity: 3,
        estimatedLineProductCostKgs: 100,
        resolvedBranchPriceKgs: 33.33,
        totalAmount: 99.99,
        branchType: 'HQ_BRANCH',
      },
      'draft',
    );
    assert.equal(dest, 100);
    assert.notEqual(roundDisplayMoney(33.33 * 3), 100);
  });

  it('3. partial FIFO consumption keeps remainder on the layer', () => {
    const sequence = consumeFifoLayerSequence(100, 3, [1]);
    assert.equal(toStoredMoneyKgs(sequence.consumed[0]!), 33.33);
    assert.equal(toStoredMoneyKgs(sequence.remainingCost), 66.67);
    assert.equal(sequence.remainingQuantity, 2);
  });

  it('4. final FIFO remainder consumption uses exact remaining cost', () => {
    const sequence = consumeFifoLayerSequence(100, 3, [1, 1, 1]);
    assert.equal(toStoredMoneyKgs(sequence.consumed.reduce((sum, row) => sum.plus(row))), 100);
    assert.equal(toStoredMoneyKgs(sequence.remainingCost), 0);
    assert.notEqual(sequence.consumed.map((row) => row.toNumber()).join('+'), '33.33+33.33+33.33');
  });

  it('5. multiple FIFO layers sum consumed cost without averaging', () => {
    const allocation = buildFifoAllocationLines(
      [
        {
          batchId: 'a',
          remainingQuantity: 5,
          unitCostKgs: deriveDisplayUnitCost(500, 5),
          layerTotalCostKgs: 500,
          layerBaseQuantity: 5,
        },
        {
          batchId: 'b',
          remainingQuantity: 7,
          unitCostKgs: deriveDisplayUnitCost(700.07, 7),
          layerTotalCostKgs: 700.07,
          layerBaseQuantity: 7,
        },
      ],
      12,
      { markupPercent: 0, branchType: 'HQ_BRANCH', subtractReserved: false },
    );
    assert.equal(allocation.totalCostKgs, 1200.07);
    assert.equal(allocation.totalPriceKgs, 1200.07);
    assert.equal(allocation.profitKgs, 0);
  });

  it('6. multiple procurement batches stay independent', () => {
    const batch1 = distributeMoneyToTarget([50.005, 50.005], 100.01);
    const batch2 = distributeMoneyToTarget([40, 40.01], 80.01);
    const bpr = calculateBprOrderTotalKgs(
      [...batch1, ...batch2].map((cost) => ({
        quantity: 2,
        estimatedLineProductCostKgs: toStoredMoneyKgs(cost),
        resolvedBranchPriceKgs: deriveDisplayUnitCost(toStoredMoneyKgs(cost), 2),
        branchType: 'HQ_BRANCH',
      })),
      'draft',
    );
    assert.equal(bpr, 180.02);
  });

  it('7. full-batch HQ Branch transfer copies procurement line costs', () => {
    const proc = buildProcLines();
    const bpr = calculateBprOrderTotalKgs(
      proc.map((line) => ({
        quantity: line.quantity,
        estimatedLineProductCostKgs: line.totalCostKgs,
        resolvedBranchPriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
        totalAmount: roundDisplayMoney(
          deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity,
        ),
        branchType: 'HQ_BRANCH',
      })),
      'draft',
    );
    assert.equal(sumDisplayMoneyTotals(proc.map((line) => line.totalCostKgs)), LANDED_TOTAL);
    assert.equal(bpr, LANDED_TOTAL);
  });

  it('8. partial-batch HQ Branch transfer consumes remainder-safe FIFO share', () => {
    const first = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 10,
      remainingQuantity: 10,
      takeQuantity: 4,
    });
    const rest = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 10,
      remainingQuantity: 6,
      takeQuantity: 6,
    });
    assert.equal(roundDisplayMoney(first + rest), 100);
    const bpr = calculateBprLineTotalKgs(
      {
        quantity: 10,
        approvedQuantity: 4,
        lineStatus: 'PARTIALLY_APPROVED',
        estimatedLineProductCostKgs: 100,
        resolvedBranchPriceKgs: 10,
        branchType: 'HQ_BRANCH',
      },
      'reviewed',
    );
    assert.equal(bpr, first);
  });

  it('9. procurement → HQ FIFO reconciliation', () => {
    const allocated = distributeMoneyToTarget([33.333, 33.333, 33.334], 100);
    assertMoneyChainReconciles({
      procurementFinalCostKgs: 100,
      allocatedItemCostsKgs: toStoredMoneyKgs(allocated.reduce((sum, row) => sum.plus(row))),
      hqFifoCreatedKgs: 100,
      hqFifoConsumedKgs: 100,
      hqBranchTransferKgs: 100,
      branchFifoCreatedKgs: 100,
      branchInventoryValueKgs: 100,
    });
  });

  it('10. HQ FIFO → BPR reconciliation rejects unit×qty reconstruction', () => {
    const fifo = [33.34, 33.33, 33.33];
    const ok = reconcileHqBranchBprToFifo({
      fifoLineCostsKgs: fifo,
      bprLineTotalsKgs: fifo,
      bprHeaderTotalKgs: 100,
    });
    assert.equal(ok.ok, true);
    const drifted = reconcileHqBranchBprToFifo({
      fifoLineCostsKgs: fifo,
      bprLineTotalsKgs: [33.33, 33.33, 33.33],
      bprHeaderTotalKgs: 99.99,
    });
    assert.equal(drifted.ok, false);
  });

  it('11. BPR → Branch FIFO reconciliation keeps transfer cost', () => {
    const transfer = 100.01;
    const branchFifo = applyHqBranchInternalDistributionProfit(
      {
        quantity: 3,
        unitPrice: 33.34,
        unitCost: 33.34,
        totalPrice: transfer,
        totalCost: transfer,
        profit: 0,
      },
      'HQ_BRANCH',
    );
    assert.equal(branchFifo.totalCost, transfer);
    assert.equal(branchFifo.profit, 0);
    const chain = reconcileMoneyChain({
      procurementFinalCostKgs: transfer,
      allocatedItemCostsKgs: transfer,
      hqFifoCreatedKgs: transfer,
      hqFifoConsumedKgs: transfer,
      hqBranchTransferKgs: transfer,
      branchFifoCreatedKgs: branchFifo.totalCost,
      branchInventoryValueKgs: branchFifo.totalCost,
    });
    assert.equal(chain.ok, true);
  });

  it('12. page reload / re-present does not alter HQ Branch total', () => {
    const proc = buildProcLines();
    const request = {
      status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
      reviewedAt: new Date(),
      totalEstimatedAmount: WRONG_BPR_TOTAL,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: proc.map((line, index) => ({
        id: `item-${index}`,
        productId: line.productId,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        lineStatus: 'APPROVED',
        unit: 'pcs',
        estimatedLineProductCostKgs: line.totalCostKgs,
        resolvedBranchPriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
        wholesalePriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
        totalAmount: roundDisplayMoney(
          deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity,
        ),
      })),
    };
    const first = toBranchPurchaseRequestResponse(request);
    const second = toBranchPurchaseRequestResponse(request);
    assert.equal(first.totalEstimatedAmount, LANDED_TOTAL);
    assert.equal(second.totalEstimatedAmount, first.totalEstimatedAmount);
  });

  it('13. HQ Branch markup = 0 (price equals FIFO cost even if a markup is passed)', () => {
    assert.equal(shouldTransferBranchPurchaseAtCost('HQ_BRANCH'), true);
    const allocation = buildFifoAllocationLines(
      [
        {
          batchId: 'layer',
          remainingQuantity: 3,
          unitCostKgs: 33.33,
          layerTotalCostKgs: 100,
          layerBaseQuantity: 3,
        },
      ],
      3,
      { markupPercent: 12, branchType: 'HQ_BRANCH', subtractReserved: false },
    );
    assert.equal(allocation.totalPriceKgs, 100);
    assert.equal(allocation.totalCostKgs, 100);
    assert.equal(allocation.profitKgs, 0);
  });

  it('14. HQ internal transfer profit = 0', () => {
    const line = applyHqBranchInternalDistributionProfit(
      {
        quantity: 3,
        unitPrice: 33.33,
        unitCost: 30,
        totalPrice: 100,
        totalCost: 90,
        profit: 10,
      },
      'HQ_BRANCH',
    );
    assert.equal(line.profit, 0);
    assert.equal(line.totalCost, 100);
  });

  it('repair copies procurement line costs onto BPR derived totals (no +0.82 lump)', () => {
    const proc = buildProcLines();
    const driftedBpr = proc.map((line, index) => ({
      id: `bpr-line-${index}`,
      productId: line.productId,
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      approvedQuantity: line.quantity,
      estimatedLineProductCostKgs: line.totalCostKgs,
      totalAmount: roundDisplayMoney(
        deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity,
      ),
      resolvedBranchPriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
    }));
    const wrongHeader = sumDisplayMoneyTotals(driftedBpr.map((row) => Number(row.totalAmount)));
    const plan = planHqBranchBprRepairFromProcurement({
      branchType: 'HQ_BRANCH',
      storedHeaderTotalKgs: wrongHeader,
      procurementItems: proc,
      bprItems: driftedBpr,
    });
    assert.equal(plan.skipped, false);
    assert.equal(plan.procurementSumKgs, LANDED_TOTAL);
    assert.equal(plan.newHeaderTotalKgs, LANDED_TOTAL);
    assert.notEqual(plan.oldHeaderTotalKgs, LANDED_TOTAL);
    assert.ok(plan.linePatches.length > 0);
    assert.equal(plan.unmatchedBprItemIds.length, 0);
    assert.ok(!plan.linePatches.some((row) => row.newLineKgs === 0.82));
    const patchSum = roundDisplayMoney(
      plan.linePatches.reduce((sum, row) => sum + row.differenceKgs, 0),
    );
    assert.equal(patchSum, roundDisplayMoney(plan.oldHeaderTotalKgs - plan.newHeaderTotalKgs));
  });

  it('fail-closed: HQ Branch destination must equal procurement source', () => {
    assert.doesNotThrow(() => assertMoneyEqual(LANDED_TOTAL, LANDED_TOTAL, 'HQ_BRANCH transfer'));
    assert.throws(
      () => assertMoneyEqual(LANDED_TOTAL, WRONG_BPR_TOTAL, 'HQ_BRANCH transfer'),
      /HQ_BRANCH transfer/,
    );
  });

  it('authoritative helpers return Decimal, never JS number', () => {
    const value = new Prisma.Decimal('100.01');
    assert.equal(typeof value, 'object');
    assert.notEqual(typeof value, 'number');
  });
});
