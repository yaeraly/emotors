import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBranchPurchaseApprovedInvoiceLines,
  resolveBranchPurchaseApprovedInvoiceLine,
  sumBranchPurchaseApprovedInvoiceTotalKgs,
} from './branch-purchase-invoice-lines.util';

describe('branch purchase approved invoice lines', () => {
  it('HQ_BRANCH uses FIFO line total (not rounded unit × qty)', () => {
    const line = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'prod-reducer',
      sku: 'RED-18',
      productName: 'Редуктор 18 зуб 4.3 кг',
      quantity: 2,
      approvedQuantity: 2,
      lineStatus: 'APPROVED',
      branchPurchasePriceKgs: 1963.59,
      resolvedBranchPriceKgs: 1963.59,
      totalAmount: 3927.18,
      approvedLineTotalKgs: 3927.18,
      estimatedLineProductCostKgs: 3927.18,
      branchType: 'HQ_BRANCH',
    });

    assert.equal(line.quantity, 2);
    assert.equal(line.lineTotal, 3927.18);
    assert.equal(line.unitPrice, 1963.59);
  });

  it('HQ_BRANCH preserves FIFO remainder instead of unit×qty snapshot', () => {
    const line = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'prod-main',
      sku: 'MAIN',
      productName: 'Main assembly',
      quantity: 11,
      approvedQuantity: 11,
      lineStatus: 'APPROVED',
      branchPurchasePriceKgs: 14756.12,
      resolvedBranchPriceKgs: 14756.12,
      totalAmount: 162317.32,
      approvedLineTotalKgs: 162317.32,
      estimatedLineProductCostKgs: 162317.33,
      branchType: 'HQ_BRANCH',
    });

    assert.equal(line.lineTotal, 162317.33);
    assert.notEqual(line.lineTotal, 162317.32);
  });

  it('HQ_BRANCH payable is FIFO inventory cost when it differs from unit×qty', () => {
    const line = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'prod-main',
      sku: 'MAIN',
      productName: 'Main assembly',
      quantity: 2,
      approvedQuantity: 2,
      lineStatus: 'APPROVED',
      branchPurchasePriceKgs: 33935.07,
      resolvedBranchPriceKgs: 33935.07,
      totalAmount: 67870.14,
      approvedLineTotalKgs: 67870.14,
      estimatedLineProductCostKgs: 72490.5,
      branchType: 'HQ_BRANCH',
    });

    assert.equal(line.lineTotal, 72490.5);
    assert.notEqual(line.lineTotal, 67870.14);
  });

  it('invoice total equals sum of approved BPR commercial line snapshots', () => {
    const items = [
      {
        productId: 'prod-a',
        quantity: 2,
        approvedQuantity: 2,
        lineStatus: 'APPROVED',
        branchPurchasePriceKgs: 1963.59,
        totalAmount: 3927.18,
        approvedLineTotalKgs: 3927.18,
        estimatedLineProductCostKgs: 3927.18,
        branchType: 'HQ_BRANCH',
      },
      {
        productId: 'prod-other',
        quantity: 1,
        approvedQuantity: 1,
        lineStatus: 'APPROVED',
        branchPurchasePriceKgs: 68563.32,
        totalAmount: 68563.32,
        approvedLineTotalKgs: 68563.32,
        estimatedLineProductCostKgs: 68563.32,
        branchType: 'HQ_BRANCH',
      },
    ];

    const total = sumBranchPurchaseApprovedInvoiceTotalKgs(items);
    const lines = buildBranchPurchaseApprovedInvoiceLines(items);
    const lineSum = lines.reduce((sum, row) => sum + row.lineTotal, 0);
    assert.equal(total, 72490.5);
    assert.equal(lineSum, 72490.5);
  });

  it('rejected lines contribute zero quantity and amount', () => {
    const line = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'prod-x',
      quantity: 5,
      approvedQuantity: 0,
      lineStatus: 'REJECTED',
      branchPurchasePriceKgs: 1000,
      totalAmount: 5000,
      branchType: 'HQ_BRANCH',
    });
    assert.equal(line.quantity, 0);
    assert.equal(line.lineTotal, 0);
  });
});
