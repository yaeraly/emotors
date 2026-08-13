import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus, Role, SaleStatus } from '@prisma/client';
import { CASHIER_CAPABILITY_PERMISSION } from '../rbac/cashier-capability.util';
import {
  assertBranchSalesManagerCanCancelSale,
  canAcceptSalePayment,
  isSaleCancellableByBranchSalesManager,
  shouldSyncSalePaymentsOnDraftSave,
} from './branch-sales-workflow.util';

const branchSalesManager = {
  role: Role.MANAGER,
  roles: [Role.MANAGER],
  branchId: 'branch-1',
  permissions: ['sales.manage'],
};

const branchCashier = {
  role: Role.CASHIER,
  roles: [Role.CASHIER],
  branchId: 'branch-1',
  permissions: ['payments.manage', 'cashier'],
};

const branchOwner = {
  role: Role.FRANCHISE_OWNER,
  roles: [Role.FRANCHISE_OWNER],
  branchId: 'branch-1',
  permissions: ['sales.manage', 'payments.manage'],
};

describe('branch sales workflow permissions', () => {
  it('branch sales manager cannot accept sale payments', () => {
    assert.equal(canAcceptSalePayment(branchSalesManager), false);
  });

  it('branch cashier can accept sale payments', () => {
    assert.equal(canAcceptSalePayment(branchCashier), true);
  });

  it('branch owner can accept sale payments', () => {
    assert.equal(canAcceptSalePayment(branchOwner), true);
  });

  it('sales manager with cashier capability can accept payments', () => {
    assert.equal(
      canAcceptSalePayment({
        ...branchSalesManager,
        permissions: ['sales.manage', CASHIER_CAPABILITY_PERMISSION, 'payments.manage'],
      }),
      true,
    );
  });

  it('draft save does not sync payments for branch sales manager', () => {
    assert.equal(
      shouldSyncSalePaymentsOnDraftSave({
        user: branchSalesManager,
        paymentType: 'FULL_PAYMENT',
      }),
      false,
    );
  });

  it('draft save does not sync payments for installment drafts', () => {
    assert.equal(
      shouldSyncSalePaymentsOnDraftSave({
        user: branchCashier,
        paymentType: 'INSTALLMENT',
      }),
      false,
    );
  });

  it('draft save syncs full-payment drafts for cashier-capable users', () => {
    assert.equal(
      shouldSyncSalePaymentsOnDraftSave({
        user: branchCashier,
        paymentType: 'FULL_PAYMENT',
      }),
      true,
    );
  });

  it('branch sales manager can cancel eligible draft sale', () => {
    assert.equal(
      isSaleCancellableByBranchSalesManager({
        status: SaleStatus.DRAFT,
        paidAmount: 0,
        paymentStatus: PaymentStatus.DEBT,
      }),
      true,
    );
  });

  it('branch sales manager cannot cancel sale with confirmed payment', () => {
    assert.equal(
      isSaleCancellableByBranchSalesManager({
        status: SaleStatus.DRAFT,
        paidAmount: 500,
        paymentStatus: PaymentStatus.PARTIAL,
      }),
      false,
    );
  });

  it('branch sales manager cannot cancel finalized sale', () => {
    assert.equal(
      isSaleCancellableByBranchSalesManager({
        status: SaleStatus.FINALIZED,
        paidAmount: 0,
        paymentStatus: PaymentStatus.DEBT,
      }),
      false,
    );
  });

  it('ineligible cancellation throws business error for branch sales manager', () => {
    assert.throws(
      () =>
        assertBranchSalesManagerCanCancelSale(branchSalesManager, {
          status: SaleStatus.FINALIZED,
          paidAmount: 0,
          paymentStatus: PaymentStatus.DEBT,
        }),
      /Продажу нельзя отменить на текущем этапе/,
    );
  });

  it('eligible cancellation passes for branch sales manager', () => {
    assert.doesNotThrow(() =>
      assertBranchSalesManagerCanCancelSale(branchSalesManager, {
        status: SaleStatus.SENT_TO_CUSTOMER,
        paidAmount: 0,
        paymentStatus: PaymentStatus.DEBT,
      }),
    );
  });
});
