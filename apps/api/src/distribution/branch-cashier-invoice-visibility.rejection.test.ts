import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchInvoiceStatus } from '@prisma/client';
import { isBranchCashierInvoiceVisible } from '../distribution/branch-cashier-invoice-visibility.util';

describe('isBranchCashierInvoiceVisible rejected retail sales', () => {
  it('hides invoices for rejected or cancelled installment approvals', () => {
    const base = {
      sentToCashierAt: new Date().toISOString(),
      status: BranchInvoiceStatus.ISSUED,
      paymentType: 'INSTALLMENT' as const,
      invoiceCategory: 'RETAIL_SALE',
      saleId: 'sale-1',
      sale: {
        installmentApproval: {
          status: 'REJECTED',
          initialPayment: 0,
          financedAmount: 10000,
        },
      },
    };

    assert.equal(isBranchCashierInvoiceVisible(base), false);
    assert.equal(
      isBranchCashierInvoiceVisible({
        ...base,
        sale: { installmentApproval: { ...base.sale.installmentApproval, status: 'CANCELLED' } },
      }),
      false,
    );
    assert.equal(
      isBranchCashierInvoiceVisible({
        ...base,
        sale: { installmentApproval: { ...base.sale.installmentApproval, status: 'APPROVED' } },
      }),
      false,
    );
  });
});
