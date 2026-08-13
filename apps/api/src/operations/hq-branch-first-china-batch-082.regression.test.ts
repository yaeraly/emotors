import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus, BranchType } from '@prisma/client';
import { reconcileHqBranchBprToFifo, reconcileMoneyChain } from '../common/money/money.reconciliation';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import { buildFifoAllocationLines } from '../pricing/pricing-fifo-allocation.util';
import {
  allocateLayerConsumptionCost,
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  calculateBprLineTotalKgs,
  calculateBprOrderTotalKgs,
} from './branch-purchase-authoritative-money.util';
import { shouldTransferBranchPurchaseAtCost } from './branch-purchase-estimated-amount.util';
import {
  sanitizeBranchPurchaseRequest,
  toBranchPurchaseRequestResponse,
} from './branch-purchase-request.presenter';
import { planHqBranchBprRepairFromStoredFifo } from './repair-hq-branch-stored-fifo.util';
import { repairBranchPurchaseRequestDerivedTotalsInTx } from './branch-purchase-totals-repair.util';

/** Production first China batch / BPR-1785478341861. */
const PROCUREMENT_TOTAL = 914369.8;
const WRONG_BPR_TOTAL = 914368.98;
const PRODUCTION_DRIFT = -0.82;
const REQUEST_NUMBER = 'BPR-1785478341861';

type BatchLine = {
  sku: string;
  quantity: number;
  fifoCostKgs: number;
  displayUnit: number;
  unitTimesQty: number;
  difference: number;
};

function buildChinaBatchLines(lineCount = 62, quantity = 11): BatchLine[] {
  const rawShares = Array.from({ length: lineCount }, (_, index) => 14756.12 + (index % 17) * 0.31);
  return distributeRoundedAmounts(rawShares, PROCUREMENT_TOTAL).map((fifoCostKgs, index) => {
    const displayUnit = deriveDisplayUnitCost(fifoCostKgs, quantity);
    const unitTimesQty = roundDisplayMoney(displayUnit * quantity);
    return {
      sku: `SKU-${index + 1}`,
      quantity,
      fifoCostKgs,
      displayUnit,
      unitTimesQty,
      difference: roundDisplayMoney(unitTimesQty - fifoCostKgs),
    };
  });
}

function buildExactMinus082Lines(): BatchLine[] {
  const quantity = 11;
  const lineCount = 62;
  const weights = Array.from({ length: lineCount }, (_, i) => 1 + (i % 7) * 0.17 + i * 0.03);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const fifoLines = distributeRoundedAmounts(
    weights.map((weight) => (PROCUREMENT_TOTAL * weight) / weightSum),
    PROCUREMENT_TOTAL,
  );
  const unitTimesQty = fifoLines.map((totalCostKgs) =>
    roundDisplayMoney(deriveDisplayUnitCost(totalCostKgs, quantity) * quantity),
  );
  const orderDrift = roundDisplayMoney(WRONG_BPR_TOTAL - PROCUREMENT_TOTAL);
  let currentDrift = roundDisplayMoney(sumDisplayMoneyTotals(unitTimesQty) - PROCUREMENT_TOTAL);
  let index = 0;
  while (currentDrift !== orderDrift && index < unitTimesQty.length * 16) {
    const step = currentDrift > orderDrift ? -0.01 : 0.01;
    const targetIndex = index % unitTimesQty.length;
    unitTimesQty[targetIndex] = roundDisplayMoney(unitTimesQty[targetIndex]! + step);
    currentDrift = roundDisplayMoney(sumDisplayMoneyTotals(unitTimesQty) - PROCUREMENT_TOTAL);
    index += 1;
  }
  assert.equal(currentDrift, orderDrift);
  return fifoLines.map((fifoCostKgs, lineIndex) => {
    const displayUnit = deriveDisplayUnitCost(fifoCostKgs, quantity);
    const wrongLine = unitTimesQty[lineIndex]!;
    return {
      sku: `SKU-${lineIndex + 1}`,
      quantity,
      fifoCostKgs,
      displayUnit,
      unitTimesQty: wrongLine,
      difference: roundDisplayMoney(wrongLine - fifoCostKgs),
    };
  });
}

describe('HQ Branch first China batch 0.82 KGS drift (BPR-1785478341861)', () => {
  it('1. source cost 100.01 → HQ Branch receives exactly 100.01', () => {
    assert.equal(
      calculateBprLineTotalKgs(
        {
          quantity: 1,
          estimatedLineProductCostKgs: 100.01,
          resolvedBranchPriceKgs: 100,
          totalAmount: 100,
          branchType: 'HQ_BRANCH',
        },
        'draft',
      ),
      100.01,
    );
  });

  it('2. 3 units / total 100.00 → destination remains exactly 100.00', () => {
    const fifo = 100;
    const qty = 3;
    const displayUnit = deriveDisplayUnitCost(fifo, qty);
    assert.equal(displayUnit, 33.33);
    assert.equal(roundDisplayMoney(displayUnit * qty), 99.99);
    assert.equal(
      calculateBprLineTotalKgs(
        {
          quantity: qty,
          estimatedLineProductCostKgs: fifo,
          resolvedBranchPriceKgs: displayUnit,
          totalAmount: 99.99,
          branchType: 'HQ_BRANCH',
        },
        'draft',
      ),
      100,
    );
  });

  it('3. partial FIFO consumption preserves cost', () => {
    const consumed = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 3,
      remainingQuantity: 3,
      takeQuantity: 1,
    });
    const remaining = allocateLayerConsumptionCost({
      layerTotalCostKgs: 100,
      layerBaseQuantity: 3,
      remainingQuantity: 2,
      takeQuantity: 2,
    });
    assert.equal(roundDisplayMoney(consumed + remaining), 100);
    assert.equal(
      calculateBprLineTotalKgs(
        {
          quantity: 3,
          approvedQuantity: 1,
          lineStatus: 'PARTIALLY_APPROVED',
          estimatedLineProductCostKgs: 100,
          resolvedBranchPriceKgs: 33.33,
          branchType: 'HQ_BRANCH',
        },
        'reviewed',
      ),
      consumed,
    );
  });

  it('4. final FIFO consumption reconciles exact remainder', () => {
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
    assert.equal(roundDisplayMoney(first + second + last), 100);
    assert.notEqual(roundDisplayMoney(33.33 + 33.33 + 33.33), 100);
  });

  it('5. multiple FIFO layers reconcile', () => {
    const allocation = buildFifoAllocationLines(
      [
        {
          batchId: 'batch-1',
          remainingQuantity: 10,
          unitCostKgs: deriveDisplayUnitCost(12345.67, 10),
          layerTotalCostKgs: 12345.67,
          layerBaseQuantity: 10,
        },
        {
          batchId: 'batch-2',
          remainingQuantity: 10,
          unitCostKgs: deriveDisplayUnitCost(9876.54, 10),
          layerTotalCostKgs: 9876.54,
          layerBaseQuantity: 10,
        },
      ],
      15,
      { markupPercent: 0, branchType: 'HQ_BRANCH', subtractReserved: false },
    );
    assert.equal(allocation.totalCostKgs, allocation.totalPriceKgs);
    assert.equal(
      calculateBprLineTotalKgs(
        {
          quantity: 15,
          estimatedLineProductCostKgs: allocation.totalCostKgs,
          resolvedBranchPriceKgs: deriveDisplayUnitCost(allocation.totalCostKgs, 15),
          branchType: 'HQ_BRANCH',
        },
        'draft',
      ),
      allocation.totalCostKgs,
    );
  });

  it('6. first China batch: procurement = HQ→Branch = 914369.80, difference 0.00', () => {
    const lines = buildChinaBatchLines();
    const procurement = sumDisplayMoneyTotals(lines.map((line) => line.fifoCostKgs));
    const unitTimesQty = sumDisplayMoneyTotals(lines.map((line) => line.unitTimesQty));
    const bprTotal = calculateBprOrderTotalKgs(
      lines.map((line) => ({
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        lineStatus: 'APPROVED',
        estimatedLineProductCostKgs: line.fifoCostKgs,
        resolvedBranchPriceKgs: line.displayUnit,
        totalAmount: line.unitTimesQty,
        approvedLineTotalKgs: line.unitTimesQty,
        branchType: 'HQ_BRANCH',
      })),
      'reviewed',
    );
    assert.equal(procurement, PROCUREMENT_TOTAL);
    assert.equal(bprTotal, PROCUREMENT_TOTAL);
    assert.equal(roundDisplayMoney(procurement - bprTotal), 0);
    assert.notEqual(unitTimesQty, PROCUREMENT_TOTAL);
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.HQ_BRANCH), true);

    const chain = reconcileMoneyChain({
      procurementFinalCostKgs: procurement,
      allocatedItemCostsKgs: procurement,
      hqFifoCreatedKgs: procurement,
      hqFifoConsumedKgs: procurement,
      hqBranchTransferKgs: bprTotal,
      branchFifoCreatedKgs: bprTotal,
      branchInventoryValueKgs: bprTotal,
    });
    assert.equal(chain.ok, true);
    const bprParity = reconcileHqBranchBprToFifo({
      fifoLineCostsKgs: lines.map((line) => line.fifoCostKgs),
      bprLineTotalsKgs: lines.map((line) =>
        calculateBprLineTotalKgs(
          {
            quantity: line.quantity,
            estimatedLineProductCostKgs: line.fifoCostKgs,
            resolvedBranchPriceKgs: line.displayUnit,
            totalAmount: line.unitTimesQty,
            branchType: 'HQ_BRANCH',
          },
          'reviewed',
        ),
      ),
      bprHeaderTotalKgs: bprTotal,
    });
    assert.equal(bprParity.ok, true);
    assert.equal(bprParity.differenceKgs, 0);
  });

  it('6b. product rows whose unit×qty ≠ FIFO explain the production −0.82 pattern', () => {
    const lines = buildExactMinus082Lines();
    const fifoSum = sumDisplayMoneyTotals(lines.map((line) => line.fifoCostKgs));
    const wrongSum = sumDisplayMoneyTotals(lines.map((line) => line.unitTimesQty));
    const rowDiff = roundDisplayMoney(lines.reduce((sum, line) => sum + line.difference, 0));
    assert.equal(fifoSum, PROCUREMENT_TOTAL);
    assert.equal(wrongSum, WRONG_BPR_TOTAL);
    assert.equal(rowDiff, PRODUCTION_DRIFT);
    assert.equal(roundDisplayMoney(PROCUREMENT_TOTAL - WRONG_BPR_TOTAL), 0.82);

    const drifted = lines.filter((line) => Math.abs(line.difference) >= 0.005);
    assert.ok(drifted.length > 0);
    const bprTotal = calculateBprOrderTotalKgs(
      lines.map((line) => ({
        quantity: line.quantity,
        estimatedLineProductCostKgs: line.fifoCostKgs,
        resolvedBranchPriceKgs: line.displayUnit,
        totalAmount: line.unitTimesQty,
        approvedLineTotalKgs: line.unitTimesQty,
        lineStatus: 'APPROVED',
        approvedQuantity: line.quantity,
        branchType: 'HQ_BRANCH',
      })),
      'reviewed',
    );
    assert.equal(bprTotal, PROCUREMENT_TOTAL);
    assert.notEqual(bprTotal, WRONG_BPR_TOTAL);
  });

  it('7+8. list/detail and refresh use the same FIFO total', () => {
    const lines = buildChinaBatchLines();
    const request = {
      status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
      reviewedAt: new Date(),
      totalEstimatedAmount: WRONG_BPR_TOTAL,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: lines.map((line, index) => ({
        id: `item-${index}`,
        productId: `prod-${index}`,
        sku: line.sku,
        productName: line.sku,
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        lineStatus: 'APPROVED',
        unit: 'pcs',
        estimatedLineProductCostKgs: line.fifoCostKgs,
        resolvedBranchPriceKgs: line.displayUnit,
        wholesalePriceKgs: line.displayUnit,
        totalAmount: line.unitTimesQty,
        approvedLineTotalKgs: line.unitTimesQty,
      })),
    };
    const full = toBranchPurchaseRequestResponse(request);
    const sanitized = sanitizeBranchPurchaseRequest(request, true);
    const again = toBranchPurchaseRequestResponse(request);
    assert.equal(full.totalEstimatedAmount, PROCUREMENT_TOTAL);
    assert.equal(sanitized.totalEstimatedAmount, PROCUREMENT_TOTAL);
    assert.equal(again.totalEstimatedAmount, PROCUREMENT_TOTAL);
    assert.equal(full.totalEstimatedAmount, sanitized.totalEstimatedAmount);
  });

  it('9+10. HQ Branch markup remains 0% and internal transfer profit remains 0', () => {
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.HQ_BRANCH), true);
    const line = calculateBprLineTotalKgs(
      {
        quantity: 11,
        estimatedLineProductCostKgs: 14756.13,
        resolvedBranchPriceKgs: 16000,
        totalAmount: 176000,
        branchType: 'HQ_BRANCH',
      },
      'draft',
    );
    assert.equal(line, 14756.13);
    assert.notEqual(line, 176000);
  });

  it('11. future batches use the same FIFO architecture (batch 2 pattern)', () => {
    const batch2 = 822036.2;
    const rawShares = Array.from({ length: 55 }, (_, index) => 12000.45 + (index % 13) * 0.27);
    const fifo = distributeRoundedAmounts(rawShares, batch2);
    const total = calculateBprOrderTotalKgs(
      fifo.map((cost, index) => ({
        quantity: 10,
        estimatedLineProductCostKgs: cost,
        resolvedBranchPriceKgs: deriveDisplayUnitCost(cost, 10),
        totalAmount: roundDisplayMoney(deriveDisplayUnitCost(cost, 10) * 10),
        branchType: 'HQ_BRANCH',
      })),
      'draft',
    );
    assert.equal(total, batch2);
  });

  it('repair from stored FIFO restores 914368.98 → 914369.80 without live FIFO', () => {
    const lines = buildExactMinus082Lines();
    const plan = planHqBranchBprRepairFromStoredFifo({
      branchType: 'HQ_BRANCH',
      storedHeaderTotalKgs: WRONG_BPR_TOTAL,
      items: lines.map((line, index) => ({
        id: `item-${index}`,
        productName: line.sku,
        sku: line.sku,
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        lineStatus: 'APPROVED',
        estimatedLineProductCostKgs: line.fifoCostKgs,
        totalAmount: line.unitTimesQty,
        approvedLineTotalKgs: line.unitTimesQty,
        resolvedBranchPriceKgs: line.displayUnit,
      })),
    });
    assert.equal(plan.skipped, false);
    assert.equal(plan.oldHeaderTotalKgs, WRONG_BPR_TOTAL);
    assert.equal(plan.newHeaderTotalKgs, PROCUREMENT_TOTAL);
    assert.equal(roundDisplayMoney(plan.newHeaderTotalKgs - plan.oldHeaderTotalKgs), 0.82);
    assert.ok(plan.linePatches.length > 0);
    assert.equal(
      roundDisplayMoney(plan.linePatches.reduce((sum, row) => sum + row.differenceKgs, 0)),
      PRODUCTION_DRIFT,
    );
  });

  it(`${REQUEST_NUMBER} persist repair copies FIFO snapshot onto BPR totals`, async () => {
    const lines = buildExactMinus082Lines();
    const request = {
      id: 'bpr-1785478341861',
      requestNumber: REQUEST_NUMBER,
      status: BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      reviewedAt: new Date(),
      totalEstimatedAmount: WRONG_BPR_TOTAL,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: lines.map((line, index) => ({
        id: `line-${index}`,
        productId: `prod-${index}`,
        sku: line.sku,
        productName: line.sku,
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        lineStatus: 'APPROVED',
        unit: 'pcs',
        estimatedLineProductCostKgs: line.fifoCostKgs,
        resolvedBranchPriceKgs: line.displayUnit,
        wholesalePriceKgs: line.displayUnit,
        totalAmount: line.unitTimesQty,
        approvedLineTotalKgs: line.unitTimesQty,
        hasPricingPolicyAtSubmit: true,
        hasPricingPolicyAtReview: true,
      })),
    };
    const tx = {
      branch: {
        findFirst: async () => ({ branchType: 'HQ_BRANCH' }),
      },
      branchPurchaseRequest: {
        findUnique: async () => request,
        update: async (args: { data: { totalEstimatedAmount: number } }) => {
          request.totalEstimatedAmount = args.data.totalEstimatedAmount;
          return request;
        },
      },
      branchPurchaseRequestItem: {
        findMany: async () => request.items,
        update: async (args: {
          where: { id: string };
          data: { totalAmount: number; approvedLineTotalKgs: number | null };
        }) => {
          const row = request.items.find((item) => item.id === args.where.id);
          if (row) {
            row.totalAmount = args.data.totalAmount;
            row.approvedLineTotalKgs = args.data.approvedLineTotalKgs as number;
          }
          return row;
        },
      },
    };
    const result = await repairBranchPurchaseRequestDerivedTotalsInTx(tx, request.id);
    assert.equal(result.previousOrderTotalKgs, WRONG_BPR_TOTAL);
    assert.equal(result.repairedOrderTotalKgs, PROCUREMENT_TOTAL);
    assert.equal(Number(request.totalEstimatedAmount), PROCUREMENT_TOTAL);
    const lineSum = sumDisplayMoneyTotals(request.items.map((item) => Number(item.totalAmount)));
    assert.equal(lineSum, PROCUREMENT_TOTAL);
  });
});
