import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BranchInstallmentEarlyPaymentStatus, BranchInstallmentEarlyPaymentType } from '@prisma/client';
import {
  canSendEarlyPaymentToCashier,
  isEarlyPaymentSentToCashier,
  resolveEarlyPaymentApprovedAmount,
  validateEarlyPaymentAmount,
} from './branch-installment-early-payment.util';

describe('branch-installment-early-payment.util', () => {
  it('validates early payment amount > 0 and <= remaining debt', () => {
    assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 100, 500), null);
    assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 0, 500), 'AMOUNT_REQUIRED');
    assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 600, 500), 'AMOUNT_EXCEEDS_DEBT');
  });

  it('requires full early payment amount to match remaining debt', () => {
    assert.equal(
      validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.FULL, 400, 500),
      'FULL_PAYMENT_AMOUNT_MISMATCH',
    );
    assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.FULL, 500, 500), null);
  });

  it('cannot send to cashier before Branch CEO approval', () => {
    assert.equal(
      canSendEarlyPaymentToCashier(BranchInstallmentEarlyPaymentStatus.PENDING_BRANCH_CEO_APPROVAL),
      false,
    );
    assert.equal(
      canSendEarlyPaymentToCashier(BranchInstallmentEarlyPaymentStatus.REJECTED_BY_BRANCH_CEO),
      false,
    );
  });

  it('can send to cashier after Branch CEO approval', () => {
    assert.equal(
      canSendEarlyPaymentToCashier(BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO),
      true,
    );
  });

  it('CEO approval alone is not cashier-visible; send marks visibility', () => {
    assert.equal(
      isEarlyPaymentSentToCashier(BranchInstallmentEarlyPaymentStatus.APPROVED_BY_BRANCH_CEO),
      false,
    );
    assert.equal(isEarlyPaymentSentToCashier(BranchInstallmentEarlyPaymentStatus.SENT_TO_CASHIER), true);
  });

  it('locks approved amount to remaining debt for full repayment', () => {
    assert.equal(resolveEarlyPaymentApprovedAmount(BranchInstallmentEarlyPaymentType.FULL, 400, 500), 500);
    assert.equal(resolveEarlyPaymentApprovedAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 150, 500), 150);
  });
});
