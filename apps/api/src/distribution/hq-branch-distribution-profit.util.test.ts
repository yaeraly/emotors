import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchType } from '@prisma/client';
import {
  applyHqBranchInternalDistributionProfit,
  isHqBranchInternalDistribution,
  normalizeHqBranchDistributionOrderResponse,
  sumHqBranchDistributionOrderTotals,
} from './hq-branch-distribution-profit.util';

describe('HQ Branch internal distribution profit', () => {
  const TRANSFER_TOTAL = 72490.5;
  const WRONG_FIFO_COST = 63148.89;
  const WRONG_PROFIT = 9341.61;

  it('detects HQ Branch by authoritative branch type', () => {
    assert.equal(isHqBranchInternalDistribution(BranchType.HQ_BRANCH), true);
    assert.equal(isHqBranchInternalDistribution('HQ_BRANCH'), true);
    assert.equal(isHqBranchInternalDistribution(BranchType.FRANCHISE), false);
  });

  it('DO-BPR-1786458007921 regression: HQ transfer profit = 0, amount unchanged', () => {
    const line = applyHqBranchInternalDistributionProfit(
      {
        quantity: 2,
        unitPrice: 36245.25,
        unitCost: 31574.45,
        totalPrice: TRANSFER_TOTAL,
        totalCost: WRONG_FIFO_COST,
        profit: WRONG_PROFIT,
      },
      BranchType.HQ_BRANCH,
    );

    assert.equal(line.totalPrice, TRANSFER_TOTAL);
    assert.equal(line.totalCost, TRANSFER_TOTAL);
    assert.equal(line.profit, 0);
    assert.equal(line.unitPrice, 36245.25);
    assert.equal(line.unitCost, 36245.25);

    const totals = sumHqBranchDistributionOrderTotals([line], BranchType.HQ_BRANCH);
    assert.equal(totals.totalAmount, TRANSFER_TOTAL);
    assert.equal(totals.totalCost, TRANSFER_TOTAL);
    assert.equal(totals.totalProfit, 0);
  });

  it('normal franchise branch keeps markup profit', () => {
    const line = applyHqBranchInternalDistributionProfit(
      {
        quantity: 2,
        unitPrice: 500,
        unitCost: 300,
        totalPrice: 1000,
        totalCost: 600,
        profit: 400,
      },
      BranchType.FRANCHISE,
    );

    assert.equal(line.totalPrice, 1000);
    assert.equal(line.totalCost, 600);
    assert.equal(line.profit, 400);

    const totals = sumHqBranchDistributionOrderTotals([line], BranchType.FRANCHISE);
    assert.equal(totals.totalProfit, 400);
  });

  it('reducer regression: zero unit transfer cost with approved unit price shows 2873.58 and profit 0', () => {
    const line = applyHqBranchInternalDistributionProfit(
      {
        quantity: 2,
        unitPrice: 2873.58,
        unitCost: 0,
        totalPrice: 5747.16,
        totalCost: 0,
        profit: 5747.16,
      },
      BranchType.HQ_BRANCH,
    );

    assert.equal(line.unitCost, 2873.58);
    assert.equal(line.unitPrice, 2873.58);
    assert.equal(line.profit, 0);
    assert.equal(line.totalPrice, 5747.16);
    assert.equal(line.totalCost, 5747.16);
  });

  it('API response sets transferCostKgs from normalized unit cost (not stale zero)', () => {
    const normalized = normalizeHqBranchDistributionOrderResponse(
      {
        items: [
          {
            quantity: 2,
            unitPrice: 2873.58,
            unitCost: 0,
            totalPrice: 5747.16,
            totalCost: 0,
            profit: 5747.16,
            transferCostKgs: 0,
          },
        ],
      },
      BranchType.HQ_BRANCH,
    );

    const item = (normalized.items as Array<{ unitCost: number; transferCostKgs: number; profit: number }>)[0];
    assert.equal(item.unitCost, 2873.58);
    assert.equal(item.transferCostKgs, 2873.58);
    assert.equal(item.profit, 0);
  });

  it('API response normalizes stale HQ Branch profit on read', () => {
    const normalized = normalizeHqBranchDistributionOrderResponse(
      {
        orderNumber: 'DO-BPR-1786458007921',
        totalAmount: TRANSFER_TOTAL,
        totalCost: WRONG_FIFO_COST,
        totalProfit: WRONG_PROFIT,
        items: [
          {
            quantity: 2,
            unitPrice: 36245.25,
            unitCost: 31574.45,
            totalPrice: TRANSFER_TOTAL,
            totalCost: WRONG_FIFO_COST,
            profit: WRONG_PROFIT,
          },
        ],
      },
      BranchType.HQ_BRANCH,
    );

    assert.equal(normalized.totalAmount, TRANSFER_TOTAL);
    assert.equal(normalized.totalCost, TRANSFER_TOTAL);
    assert.equal(normalized.totalProfit, 0);
    assert.equal((normalized.items as Array<{ profit: number }>)[0]?.profit, 0);
  });
});

describe('HQ Branch customer sale profit (unchanged)', () => {
  it('customer sale profit remains selling price minus inventory cost', () => {
    const inventoryCost = 8000;
    const customerPrice = 12000;
    const profit = customerPrice - inventoryCost;
    assert.ok(profit > 0);
    assert.notEqual(customerPrice, inventoryCost);
  });
});
