import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchPurchaseRequestStatus } from '@prisma/client';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  resolveBranchPurchaseBranchLineTotalKgs,
  resolveBranchPurchaseBranchUnitPriceKgs,
  sumBranchPurchaseBranchLineTotalsKgs,
} from './branch-purchase-branch-display.util';
import { sanitizeBranchPurchaseRequest, toBranchPurchaseRequestResponse } from './branch-purchase-request.presenter';

const CHINA_BATCH_TOTAL = 914369.8;

function buildChinaBatchLine() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_TOTAL);
  const totalCostKgs = lineTotals[0];
  return { quantity, totalCostKgs, unit: deriveDisplayUnitCost(totalCostKgs, quantity) };
}

describe('branch purchase branch display totals', () => {
  it('calculates line total as quantity times resolved branch price', () => {
    assert.equal(
      resolveBranchPurchaseBranchLineTotalKgs({
        quantity: 3,
        resolvedBranchPriceKgs: 15000,
        totalAmount: 0,
      }),
      45000,
    );
  });

  it('calculates qty 10 times 2500 as 25000', () => {
    assert.equal(
      resolveBranchPurchaseBranchLineTotalKgs({
        quantity: 10,
        branchPurchasePriceKgs: 2500,
        totalAmount: 0,
      }),
      25000,
    );
  });

  it('HQ at-cost transfer uses authoritative FIFO line total instead of rounded unit×qty', () => {
    const line = buildChinaBatchLine();
    const roundedUnitTotal = roundDisplayMoney(line.unit * line.quantity);
    assert.notEqual(roundedUnitTotal, line.totalCostKgs);
    assert.equal(
      resolveBranchPurchaseBranchLineTotalKgs({
        quantity: line.quantity,
        branchPurchasePriceKgs: line.unit,
        resolvedBranchPriceKgs: line.unit,
        totalAmount: line.totalCostKgs,
        transferAtCost: true,
      }),
      line.totalCostKgs,
    );
    assert.notEqual(
      resolveBranchPurchaseBranchLineTotalKgs({
        quantity: line.quantity,
        branchPurchasePriceKgs: line.unit,
        resolvedBranchPriceKgs: line.unit,
        totalAmount: line.totalCostKgs,
        transferAtCost: false,
      }),
      line.totalCostKgs,
    );
  });

  it('does not use wholesale when resolved branch price exists', () => {
    assert.equal(
      resolveBranchPurchaseBranchUnitPriceKgs({
        resolvedBranchPriceKgs: 15000,
        branchPurchasePriceKgs: 8000,
      }),
      8000,
    );
    assert.equal(
      resolveBranchPurchaseBranchUnitPriceKgs({
        resolvedBranchPriceKgs: 15000,
      }),
      15000,
    );
  });

  it('sums independent line totals for order total', () => {
    assert.equal(
      sumBranchPurchaseBranchLineTotalsKgs([
        { quantity: 3, resolvedBranchPriceKgs: 15000, totalAmount: 0 },
        { quantity: 10, branchPurchasePriceKgs: 2500, totalAmount: 0 },
        { quantity: 2, resolvedBranchPriceKgs: 15000, totalAmount: 0 },
      ]),
      100000,
    );
  });

  it('sanitized branch-only response repairs stale zero line totals', () => {
    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.SUBMITTED,
        reviewedAt: null,
        totalEstimatedAmount: 0,
        transportCostKgs: 0,
        branch: { branchType: 'FRANCHISE' },
        items: [
          {
            id: 'line-1',
            productId: 'prod-1',
            sku: 'SKU-1',
            productName: 'Контроллер',
            quantity: 3,
            unit: 'pcs',
            resolvedBranchPriceKgs: 15000,
            wholesalePriceKgs: 12000,
            totalAmount: 0,
          },
          {
            id: 'line-2',
            productId: 'prod-2',
            sku: 'SKU-2',
            productName: 'Датчик',
            quantity: 10,
            unit: 'pcs',
            resolvedBranchPriceKgs: 2500,
            wholesalePriceKgs: 2000,
            totalAmount: 0,
          },
        ],
      },
      true,
    );

    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, 45000);
    assert.equal((sanitized.items[1] as { totalAmount?: number }).totalAmount, 25000);
    assert.equal(sanitized.totalEstimatedAmount, 70000);
    assert.equal((sanitized.items[0] as { branchPurchasePriceKgs?: number }).branchPurchasePriceKgs, 15000);
    assert.equal((sanitized.items[0] as { wholesalePriceKgs?: unknown }).wholesalePriceKgs, undefined);
  });

  it('sanitized SUBMITTED_TO_HQ list total matches create-form qty × branch price', () => {
    const displayUnit = 1963.59;
    const qty = 2;
    const createFormLineTotal = 3927.18;
    const fifoCost = 630.15;
    const request = {
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      reviewedAt: null,
      totalEstimatedAmount: fifoCost,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-1',
          productId: 'prod-1',
          sku: 'SKU-1',
          productName: 'Редуктор 23 зуб 5 кг',
          quantity: qty,
          unit: 'pcs',
          estimatedLineProductCostKgs: fifoCost,
          resolvedBranchPriceKgs: displayUnit,
          totalAmount: fifoCost,
        },
      ],
    };
    const full = toBranchPurchaseRequestResponse(request);
    const sanitized = sanitizeBranchPurchaseRequest(request, true);

    assert.equal(full.totalEstimatedAmount, createFormLineTotal);
    assert.equal(sanitized.totalEstimatedAmount, createFormLineTotal);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, createFormLineTotal);
    assert.equal(
      (sanitized.items[0] as { branchPurchasePriceKgs?: number }).branchPurchasePriceKgs,
      displayUnit,
    );
    assert.notEqual(sanitized.totalEstimatedAmount, fifoCost);
  });

  it('sanitized multi-line SUBMITTED order keeps create-form commercial total', () => {
    // Create form: commercial qty×price sum; FIFO/stale header must not win.
    const commercialTotal = 72490.5;
    const staleFifoHeader = 67870.14;
    const request = {
      status: BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
      reviewedAt: null,
      totalEstimatedAmount: staleFifoHeader,
      transportCostKgs: 0,
      branch: { branchType: 'HQ_BRANCH' },
      items: [
        {
          id: 'line-a',
          productId: 'prod-a',
          sku: 'A',
          productName: 'A',
          quantity: 2,
          unit: 'pcs',
          estimatedLineProductCostKgs: 1000,
          resolvedBranchPriceKgs: 1963.59,
          totalAmount: 1000,
        },
        {
          id: 'line-b',
          productId: 'prod-b',
          sku: 'B',
          productName: 'B',
          quantity: 1,
          unit: 'pcs',
          estimatedLineProductCostKgs: 500,
          resolvedBranchPriceKgs: commercialTotal - 3927.18,
          totalAmount: 500,
        },
      ],
    };
    const sanitized = sanitizeBranchPurchaseRequest(request, true);
    assert.equal(sanitized.totalEstimatedAmount, commercialTotal);
    assert.notEqual(sanitized.totalEstimatedAmount, staleFifoHeader);
    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, 3927.18);
  });

  it('sanitized reviewed franchise order matches HQ Sales approved line totals', () => {
    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
        reviewedAt: new Date(),
        totalEstimatedAmount: 25000,
        transportCostKgs: 0,
        branch: { branchType: 'FRANCHISE' },
        items: [
          {
            id: 'line-1',
            productId: 'prod-1',
            sku: 'SKU-1',
            productName: 'Контроллер',
            quantity: 10,
            approvedQuantity: 8,
            lineStatus: 'PARTIALLY_APPROVED',
            unit: 'pcs',
            resolvedBranchPriceKgs: 2500,
            totalAmount: 25000,
          },
        ],
      },
      true,
    );

    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, 20000);
    assert.equal(sanitized.totalEstimatedAmount, 20000);
    assert.notEqual(sanitized.totalEstimatedAmount, 25000);
  });

  it('sanitized reviewed HQ branch order keeps FIFO line total not rounded unit×qty', () => {
    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
        reviewedAt: new Date(),
        totalEstimatedAmount: 67870.14,
        transportCostKgs: 0,
        branch: { branchType: 'HQ_BRANCH' },
        items: [
          {
            id: 'line-1',
            productId: 'prod-1',
            sku: 'SKU-1',
            productName: 'Редуктор 18 зуб 4.3 кг',
            quantity: 2,
            approvedQuantity: 2,
            lineStatus: 'APPROVED',
            unit: 'pcs',
            estimatedLineProductCostKgs: 72490.5,
            resolvedBranchPriceKgs: 33935.07,
            totalAmount: 67870.14,
          },
        ],
      },
      true,
    );

    assert.equal((sanitized.items[0] as { totalAmount?: number }).totalAmount, 72490.5);
    assert.equal(sanitized.totalEstimatedAmount, 72490.5);
    assert.notEqual(sanitized.totalEstimatedAmount, 67870.14);
  });

  it('sanitized HQ branch after review repairs 914369.08-style unit×qty totals to FIFO 914369.80', () => {
    const quantity = 11;
    const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
    const lineTotals = distributeRoundedAmounts(rawShares, CHINA_BATCH_TOTAL);
    const lines = lineTotals.map((totalCostKgs, index) => ({
      sku: `SKU-${index}`,
      quantity,
      totalCostKgs,
      unit: deriveDisplayUnitCost(totalCostKgs, quantity),
    }));
    const driftedHeader = sumDisplayMoneyTotals(
      lines.map((line) => roundDisplayMoney(line.unit * line.quantity)),
    );
    assert.notEqual(driftedHeader, CHINA_BATCH_TOTAL);

    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
        reviewedAt: new Date(),
        // Simulate BPR-1786197962954-style drifted header/line totals after HQ review.
        totalEstimatedAmount: driftedHeader,
        transportCostKgs: 0,
        branch: { branchType: 'HQ_BRANCH' },
        items: lines.map((line, index) => ({
          id: `line-${index}`,
          productId: `prod-${index}`,
          sku: `SKU-${index}`,
          productName: `SKU-${index}`,
          quantity: line.quantity,
          approvedQuantity: line.quantity,
          lineStatus: 'APPROVED',
          unit: 'pcs',
          estimatedLineProductCostKgs: line.totalCostKgs,
          resolvedBranchPriceKgs: line.unit,
          wholesalePriceKgs: line.unit,
          totalAmount: roundDisplayMoney(line.unit * line.quantity),
        })),
      },
      true,
    );
    const lineSum = roundDisplayMoney(
      sanitized.items.reduce(
        (sum, item) => sum + Number((item as { totalAmount?: number }).totalAmount ?? 0),
        0,
      ),
    );
    assert.equal(lineSum, CHINA_BATCH_TOTAL);
    assert.equal(sanitized.totalEstimatedAmount, CHINA_BATCH_TOTAL);
    assert.notEqual(sanitized.totalEstimatedAmount, driftedHeader);
  });
});
