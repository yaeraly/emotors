import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus, SalePaymentType, SaleStatus } from '@prisma/client';
import {
  buildExpectedPaymentState,
  shouldRegisterFullPaymentForCashier,
} from './sale-full-payment.util';

const branchSalesManager = {
  role: 'MANAGER' as const,
  roles: ['MANAGER' as const],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
};

const branchSalesManagerWithCashier = {
  ...branchSalesManager,
  permissions: ['sales.manage', 'cashier'],
};

const branchCashier = {
  role: 'CASHIER' as const,
  roles: ['CASHIER' as const],
  branchId: 'branch-1',
  permissions: ['cashier', 'payments.manage'],
};

describe('sale full payment cashier registration', () => {
  it('routes branch sales manager full payment to cashier registration', () => {
    assert.equal(
      shouldRegisterFullPaymentForCashier(branchSalesManager, SalePaymentType.FULL_PAYMENT),
      true,
    );
  });

  it('does not route installment sales to cashier registration', () => {
    assert.equal(
      shouldRegisterFullPaymentForCashier(branchSalesManager, SalePaymentType.INSTALLMENT),
      false,
    );
  });

  it('does not route cashier-capable sales manager through cashier registration', () => {
    assert.equal(
      shouldRegisterFullPaymentForCashier(
        branchSalesManagerWithCashier,
        SalePaymentType.FULL_PAYMENT,
      ),
      false,
    );
  });

  it('does not route branch cashier through sales registration', () => {
    assert.equal(
      shouldRegisterFullPaymentForCashier(branchCashier, SalePaymentType.FULL_PAYMENT),
      false,
    );
  });
});

describe('expected payment state', () => {
  it('keeps confirmed paid amount at zero before cashier acceptance', () => {
    const state = buildExpectedPaymentState(120_000);
    assert.equal(state.expectedPaymentAmount, 120_000);
    assert.equal(state.paidAmount, 0);
    assert.equal(state.debtAmount, 120_000);
    assert.equal(state.paymentStatus, PaymentStatus.WAITING_FOR_CASHIER);
  });
});

describe('sale waiting status', () => {
  it('uses dedicated waiting-for-cashier sale status', () => {
    assert.equal(SaleStatus.WAITING_FOR_CASHIER_PAYMENT, 'WAITING_FOR_CASHIER_PAYMENT');
  });
});
