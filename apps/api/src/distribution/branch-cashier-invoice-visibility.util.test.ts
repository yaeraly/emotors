import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchInstallmentEarlyPaymentStatus,
  BranchInvoicePaymentType,
  BranchInvoiceStatus,
  BranchOrderInstallmentStatus,
} from '@prisma/client';
import { isBranchCashierInvoiceVisible } from './branch-cashier-invoice-visibility.util';

describe('isBranchCashierInvoiceVisible', () => {
  it('hides invoice when not sent to cashier', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: null,
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
      }),
      false,
    );
  });

  it('shows full-payment invoice after accountant send', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
      }),
      true,
    );
  });

  it('shows non-zero first installment payment after accountant send', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        branchOrderInstallment: {
          status: BranchOrderInstallmentStatus.APPROVED,
          firstPaymentRequired: true,
          firstPaymentConfirmed: false,
        },
      }),
      true,
    );
  });

  it('hides zero-initial installment until early payment is sent', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        branchOrderInstallment: {
          status: BranchOrderInstallmentStatus.APPROVED,
          firstPaymentRequired: false,
          firstPaymentConfirmed: false,
        },
      }),
      false,
    );
  });

  it('Branch CEO approval alone does not show invoice in cashier', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: null,
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        branchOrderInstallment: {
          status: BranchOrderInstallmentStatus.APPROVED,
          firstPaymentRequired: false,
          firstPaymentConfirmed: false,
        },
        installmentEarlyPaymentRequests: [
          {
            status: BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
            sentToCashierAt: null,
          },
        ],
      }),
      false,
    );
  });

  it('hides CEO-approved-but-not-sent even if invoice sentToCashierAt is set', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        branchOrderInstallment: {
          status: BranchOrderInstallmentStatus.APPROVED,
          firstPaymentRequired: false,
          firstPaymentConfirmed: false,
        },
        installmentEarlyPaymentRequests: [
          {
            status: BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO,
            sentToCashierAt: null,
          },
        ],
      }),
      false,
    );
  });

  it('hides request waiting for Branch CEO', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: null,
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        installmentEarlyPaymentRequests: [
          {
            status: BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL,
            sentToCashierAt: null,
          },
        ],
      }),
      false,
    );
  });

  it('rejected request never appears in Branch Cashier', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: null,
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        installmentEarlyPaymentRequests: [
          {
            status: BranchInstallmentEarlyPaymentStatus.REJECTED_BY_BRANCH_CEO,
            sentToCashierAt: null,
          },
        ],
      }),
      false,
    );
  });

  it('shows invoice only after Branch Accountant sends early payment', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        branchOrderInstallment: {
          status: BranchOrderInstallmentStatus.APPROVED,
          firstPaymentRequired: false,
          firstPaymentConfirmed: false,
        },
        installmentEarlyPaymentRequests: [
          {
            status: BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER,
            sentToCashierAt: new Date(),
          },
        ],
      }),
      true,
    );
  });

  it('hides already paid invoices', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.PAID,
        paymentType: BranchInvoicePaymentType.FULL_PAYMENT,
      }),
      false,
    );
  });

  it('never shows retail installment invoices in Счета к оплате', () => {
    assert.equal(
      isBranchCashierInvoiceVisible({
        invoiceCategory: 'RETAIL_SALE',
        saleId: 'sale-1',
        sentToCashierAt: new Date(),
        status: BranchInvoiceStatus.ISSUED,
        paymentType: BranchInvoicePaymentType.INSTALLMENT,
        debtAmount: 50_000,
        sale: {
          installmentApproval: {
            status: 'ACTIVE',
            initialPayment: 0,
            installmentPaidAmount: 0,
            remainingDebt: 50_000,
            financedAmount: 50_000,
            dueDate: '2026-12-31',
          },
        },
      }),
      false,
    );
  });
});
