import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchType } from '@prisma/client';
import { distributeRoundedAmounts } from '../procurement/landed-cost-allocation.util';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  BRANCH_ESTIMATED_AMOUNT_MISMATCH_MESSAGE,
  compareEstimatedAmountToProductCost,
  resolveBranchPurchaseEstimatedAmountKgs,
  resolveBranchPurchaseLinePayableAmount,
  shouldTransferBranchPurchaseAtCost,
} from './branch-purchase-estimated-amount.util';
import {
  sanitizeBranchPurchaseRequest,
  toBranchPurchaseRequestResponse,
} from './branch-purchase-request.presenter';
import { BranchPurchaseRequestStatus } from '@prisma/client';

const CHINA_BATCH_TOTAL = 914369.8;

function buildChinaBatchLines() {
  const quantity = 11;
  const rawShares = Array.from({ length: 62 }, (_, index) => 14756.12 + (index % 17) * 0.31);
  return distributeRoundedAmounts(rawShares, CHINA_BATCH_TOTAL).map((totalCostKgs, index) => ({
    sku: `SKU-${index}`,
    quantity,
    totalCostKgs,
  }));
}

describe('branch-purchase-estimated-amount — HQ at-cost parity', () => {
  it('HQ_BRANCH transfers at cost with zero markup', () => {
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.HQ_BRANCH), true);
    assert.equal(shouldTransferBranchPurchaseAtCost(BranchType.FRANCHISE), false);
  });

  it('at-cost line payable uses FIFO line total not unit×qty', () => {
    const fifoLine = 162317.33;
    const unit = deriveDisplayUnitCost(fifoLine, 11);
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.HQ_BRANCH,
      quantity: 11,
      estimatedLineProductCostKgs: fifoLine,
      unitPriceKgs: unit,
      hasPricingPolicy: true,
    });
    assert.equal(payable, fifoLine);
    assert.notEqual(payable, roundDisplayMoney(unit * 11));
  });

  it('franchise line payable uses unit price × quantity', () => {
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType: BranchType.FRANCHISE,
      quantity: 11,
      estimatedLineProductCostKgs: 1000,
      unitPriceKgs: 125,
      hasPricingPolicy: true,
    });
    assert.equal(payable, 1375);
  });

  it('Ориентировочная сумма equals Себестоимость for HQ_BRANCH', () => {
    const lines = buildChinaBatchLines();
    const productCost = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    const staleEstimated = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    const estimated = resolveBranchPurchaseEstimatedAmountKgs({
      branchType: BranchType.HQ_BRANCH,
      totalProductCostKgs: productCost,
      storedEstimatedAmountKgs: staleEstimated,
    });
    assert.equal(productCost, CHINA_BATCH_TOTAL);
    assert.equal(estimated, CHINA_BATCH_TOTAL);
    assert.notEqual(staleEstimated, CHINA_BATCH_TOTAL);
    assert.equal(roundDisplayMoney(productCost - estimated), 0);
  });

  it('does not reproduce stale 914369.26-style estimated amount for at-cost orders', () => {
    const lines = buildChinaBatchLines();
    const productCost = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    const staleUnitTimesQty = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    const response = toBranchPurchaseRequestResponse({
      status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
      reviewedAt: new Date(),
      totalEstimatedAmount: staleUnitTimesQty,
      transportCostKgs: 0,
      branch: { branchType: BranchType.HQ_BRANCH },
      items: lines.map((line) => ({
        quantity: line.quantity,
        approvedQuantity: line.quantity,
        estimatedLineProductCostKgs: line.totalCostKgs,
        totalAmount: roundDisplayMoney(
          deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity,
        ),
        resolvedBranchPriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
      })),
    });
    assert.equal(response.totalProductCostKgs, CHINA_BATCH_TOTAL);
    assert.equal(response.totalEstimatedAmount, CHINA_BATCH_TOTAL);
    assert.equal(response.totalEstimatedAmount, response.totalProductCostKgs);
    assert.notEqual(response.totalEstimatedAmount, staleUnitTimesQty);
  });

  it('compareEstimatedAmountToProductCost detects unit×qty drift', () => {
    const lines = buildChinaBatchLines();
    const productCost = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    const staleEstimated = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    const result = compareEstimatedAmountToProductCost(staleEstimated, productCost);
    assert.equal(result.ok, false);
    assert.notEqual(result.differenceKgs, 0);
    assert.match(BRANCH_ESTIMATED_AMOUNT_MISMATCH_MESSAGE, /Ориентировочная сумма/);
  });

  it('Branch Sales sanitize keeps Сумма equal to sum of branch price line totals', () => {
    const lines = buildChinaBatchLines();
    const staleEstimated = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    const sanitized = sanitizeBranchPurchaseRequest(
      {
        status: BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
        reviewedAt: new Date(),
        totalEstimatedAmount: staleEstimated,
        transportCostKgs: 0,
        branch: { branchType: BranchType.HQ_BRANCH },
        items: lines.map((line, index) => ({
          id: `item-${index}`,
          productId: `prod-${index}`,
          sku: line.sku,
          productName: line.sku,
          quantity: line.quantity,
          approvedQuantity: line.quantity,
          estimatedLineProductCostKgs: line.totalCostKgs,
          totalAmount: roundDisplayMoney(
            deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity,
          ),
          resolvedBranchPriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
          wholesalePriceKgs: deriveDisplayUnitCost(line.totalCostKgs, line.quantity),
        })),
      },
      true,
    );
    const lineSum = sumDisplayMoneyTotals(
      sanitized.items.map((item) => Number((item as { totalAmount?: number }).totalAmount ?? 0)),
    );
    assert.equal(sanitized.totalEstimatedAmount, lineSum);
    assert.ok(Math.abs(lineSum - CHINA_BATCH_TOTAL) <= 1);
    assert.equal(sanitized.totalProductCostKgs, undefined);
  });

  it('repair of estimated amount is idempotent for already-aligned totals', () => {
    const lines = buildChinaBatchLines();
    const productCost = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
    const staleEstimated = sumDisplayMoneyTotals(
      lines.map((line) =>
        roundDisplayMoney(deriveDisplayUnitCost(line.totalCostKgs, line.quantity) * line.quantity),
      ),
    );
    const first = resolveBranchPurchaseEstimatedAmountKgs({
      branchType: BranchType.HQ_BRANCH,
      totalProductCostKgs: productCost,
      storedEstimatedAmountKgs: staleEstimated,
    });
    const second = resolveBranchPurchaseEstimatedAmountKgs({
      branchType: BranchType.HQ_BRANCH,
      totalProductCostKgs: productCost,
      storedEstimatedAmountKgs: first,
    });
    assert.equal(first, productCost);
    assert.equal(second, productCost);
  });
});
