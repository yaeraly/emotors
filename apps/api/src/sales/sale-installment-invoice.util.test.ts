import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchInvoicePaymentType, BranchInvoiceStatus } from '@prisma/client';
import {
  isRetailInstallmentCashierVisible,
  isRetailInstallmentInvoice,
  isRetailInstallmentInCashierScope,
  classifyRetailInstallmentCashierScope,
  resolveRetailInstallmentPaidAmount,
  resolveRetailInstallmentRemainingDebt,
  resolveRetailInstallmentRequiredPayment,
} from './sale-installment-invoice.util';

describe('sale-installment-invoice.util', () => {
  const baseInvoice = {
    invoiceCategory: 'RETAIL_SALE',
    saleId: 'sale-1',
    paymentType: BranchInvoicePaymentType.INSTALLMENT,
    status: BranchInvoiceStatus.ISSUED,
    totalAmount: 100_000,
    paidAmount: 0,
    debtAmount: 100_000,
    sentToCashierAt: new Date('2026-08-03'),
    sale: {
      installmentApproval: {
        status: 'ACTIVE',
        initialPayment: 0,
        installmentPaidAmount: 0,
        remainingDebt: 100_000,
        financedAmount: 100_000,
        dueDate: '2026-12-31',
      },
    },
  };

  it('detects retail installment invoice', () => {
    assert.equal(isRetailInstallmentInvoice(baseInvoice), true);
  });

  it('supports zero initial payment without required upfront amount', () => {
    assert.equal(resolveRetailInstallmentRequiredPayment(baseInvoice), 100_000);
    assert.equal(resolveRetailInstallmentPaidAmount(baseInvoice), 0);
    assert.equal(resolveRetailInstallmentRemainingDebt(baseInvoice), 100_000);
  });

  it('requires initial payment amount when down payment is positive and unpaid', () => {
    const withDownPayment = {
      ...baseInvoice,
      sale: {
        installmentApproval: {
          status: 'APPROVED',
          initialPayment: 20_000,
          installmentPaidAmount: 0,
          remainingDebt: 100_000,
          financedAmount: 80_000,
          dueDate: '2026-12-31',
        },
      },
    };
    assert.equal(resolveRetailInstallmentRequiredPayment(withDownPayment), 20_000);
  });

  it('hides installment from cashier until accountant sends it', () => {
    assert.equal(
      isRetailInstallmentCashierVisible({ ...baseInvoice, sentToCashierAt: null }),
      false,
    );
    assert.equal(isRetailInstallmentCashierVisible(baseInvoice), true);
  });

  it('hides closed installment from active cashier list', () => {
    assert.equal(
      isRetailInstallmentCashierVisible({
        ...baseInvoice,
        status: BranchInvoiceStatus.PAID,
        sale: {
          installmentApproval: {
            status: 'PAID',
            initialPayment: 0,
            installmentPaidAmount: 100_000,
            remainingDebt: 0,
            financedAmount: 100_000,
          },
        },
      }),
      false,
    );
  });

  it('classifies overdue installments when due date has passed', () => {
    const overdue = {
      ...baseInvoice,
      sale: {
        installmentApproval: {
          ...baseInvoice.sale.installmentApproval,
          dueDate: '2020-01-01',
        },
      },
    };
    assert.equal(classifyRetailInstallmentCashierScope(overdue, new Date('2026-08-03')), 'overdue');
    assert.equal(isRetailInstallmentInCashierScope(overdue, 'overdue', new Date('2026-08-03')), true);
    assert.equal(isRetailInstallmentInCashierScope(overdue, 'active', new Date('2026-08-03')), false);
  });

  it('classifies fully paid installments as closed', () => {
    const closed = {
      ...baseInvoice,
      status: BranchInvoiceStatus.PAID,
      debtAmount: 0,
      sale: {
        installmentApproval: {
          status: 'PAID',
          initialPayment: 0,
          installmentPaidAmount: 100_000,
          remainingDebt: 0,
          financedAmount: 100_000,
          dueDate: '2026-12-31',
        },
      },
    };
    assert.equal(classifyRetailInstallmentCashierScope(closed), 'closed');
    assert.equal(isRetailInstallmentInCashierScope(closed, 'closed'), true);
    assert.equal(isRetailInstallmentInCashierScope(closed, 'active'), false);
  });

  it('calculates remaining debt after partial payment', () => {
    const partial = {
      ...baseInvoice,
      paidAmount: 35_000,
      debtAmount: 65_000,
      sale: {
        installmentApproval: {
          status: 'ACTIVE',
          initialPayment: 0,
          installmentPaidAmount: 35_000,
          remainingDebt: 65_000,
          financedAmount: 100_000,
        },
      },
    };
    assert.equal(resolveRetailInstallmentPaidAmount(partial), 35_000);
    assert.equal(resolveRetailInstallmentRemainingDebt(partial), 65_000);
  });
});
