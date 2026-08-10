import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildBranchPurchaseApprovedInvoiceLines,
  resolveBranchPurchaseApprovedInvoiceLine,
  sumBranchPurchaseApprovedInvoiceTotalKgs,
} from './branch-purchase-invoice-lines.util';

/** BPR-1786349778733 reducer pattern — FIFO cost must not become invoice unit price. */
describe('branch purchase approved invoice lines', () => {
  it('restores reducer line to 2 × 1963.59 = 3927.18 when FIFO cost was stored as line total', () => {
    const line = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'prod-reducer',
      sku: 'RED-18',
      productName: 'Редуктор 18 зуб 4.3 кг',
      quantity: 2,
      approvedQuantity: 2,
      lineStatus: 'APPROVED',
      branchPurchasePriceKgs: 1963.59,
      resolvedBranchPriceKgs: 1963.59,
      totalAmount: 630.15,
      approvedLineTotalKgs: 630.15,
      estimatedLineProductCostKgs: 630.15,
      branchType: 'HQ_BRANCH',
    });

    assert.equal(line.quantity, 2);
    assert.equal(line.unitPrice, 1963.59);
    assert.equal(line.lineTotal, 3927.18);
    assert.notEqual(line.unitPrice, 315.08);
    assert.notEqual(line.lineTotal, 630.15);
  });

  it('keeps HQ_BRANCH FIFO payable line when branch commercial unit×qty would drift total', () => {
    const line = resolveBranchPurchaseApprovedInvoiceLine({
      productId: 'prod-main',
      sku: 'MAIN',
      productName: 'Main assembly',
      quantity: 2,
      approvedQuantity: 2,
      lineStatus: 'APPROVED',
      branchPurchasePriceKgs: 33935.07,
      resolvedBranchPriceKgs: 33935.07,
      totalAmount: 72490.5,
      approvedLineTotalKgs: 72490.5,
      estimatedLineProductCostKgs: 72490.5,
      branchType: 'HQ_BRANCH',
    });

    assert.equal(line.lineTotal, 72490.5);
    assert.notEqual(line.lineTotal, 67870.14);
  });

  it('invoice total equals sum of approved BPR line snapshots', () => {
    const items = [
      {
        productId: 'prod-reducer',
        quantity: 2,
        approvedQuantity: 2,
        lineStatus: 'APPROVED',
        branchPurchasePriceKgs: 1963.59,
        totalAmount: 630.15,
        approvedLineTotalKgs: 630.15,
        estimatedLineProductCostKgs: 630.15,
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
