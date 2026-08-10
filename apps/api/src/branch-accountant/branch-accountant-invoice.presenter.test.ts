import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchInvoiceStatus } from '@prisma/client';
import { sanitizeAccountantInvoice } from './branch-accountant-invoice.presenter';

describe('sanitizeAccountantInvoice BPR-linked prices', () => {
  it('uses approved BPR snapshots instead of distribution FIFO unit cost for line prices', () => {
    const invoice = sanitizeAccountantInvoice({
      id: 'inv-1',
      invoiceNumber: 'INV-001',
      invoiceCategory: 'PRODUCT_ORDER',
      branchId: 'branch-1',
      branch: { id: 'branch-1', name: 'HQ Branch', code: 'HQB' },
      distributionOrderId: 'order-1',
      status: BranchInvoiceStatus.ISSUED,
      totalAmount: 630.15,
      paidAmount: 0,
      debtAmount: 630.15,
      sentToBranchAt: new Date(),
      distributionOrder: {
        orderNumber: 'ORD-001',
        items: [
          {
            id: 'order-item-1',
            productId: 'prod-reducer',
            productSku: 'RED-18',
            productName: 'Редуктор 18 зуб 4.3 кг',
            quantity: 2,
            unitPrice: 315.08,
            totalPrice: 630.15,
            product: { unit: 'pcs' },
          },
        ],
        branchPurchaseRequest: {
          id: 'bpr-1',
          requestNumber: 'BPR-1786349778733',
          branch: { branchType: 'HQ_BRANCH' },
          items: [
            {
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
            },
            {
              productId: 'prod-other',
              sku: 'OTHER',
              productName: 'Other part',
              quantity: 1,
              approvedQuantity: 1,
              lineStatus: 'APPROVED',
              branchPurchasePriceKgs: 68563.32,
              totalAmount: 68563.32,
              approvedLineTotalKgs: 68563.32,
              estimatedLineProductCostKgs: 68563.32,
            },
          ],
        },
      },
    });

    const reducer = invoice.items.find((row) => row.productId === 'prod-reducer');
    assert.ok(reducer);
    assert.equal(reducer.quantity, 2);
    assert.equal(reducer.unitPrice, 1963.59);
    assert.equal(reducer.lineTotal, 3927.18);
    assert.equal(invoice.totalAmount, 72490.5);
    assert.notEqual(reducer.unitPrice, 315.08);
    assert.notEqual(reducer.lineTotal, 630.15);
  });

  it('falls back to distribution order items when no BPR is linked', () => {
    const invoice = sanitizeAccountantInvoice({
      id: 'inv-2',
      invoiceNumber: 'INV-002',
      status: BranchInvoiceStatus.ISSUED,
      totalAmount: 500,
      paidAmount: 0,
      debtAmount: 500,
      distributionOrder: {
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            sku: 'SKU-1',
            productName: 'Widget',
            quantity: 2,
            unitPrice: 250,
            totalPrice: 500,
          },
        ],
      },
    });

    assert.equal(invoice.items[0].unitPrice, 250);
    assert.equal(invoice.totalAmount, 500);
  });
});
