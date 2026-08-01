import assert from 'node:assert/strict';
import { BranchInstallmentEarlyPaymentType } from '@prisma/client';
import {
  canSendEarlyPaymentToCashier,
  isEarlyPaymentSentToCashier,
  resolveEarlyPaymentApprovedAmount,
  validateEarlyPaymentAmount,
} from './branch-installment-early-payment.util';

assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 100, 500), null);
assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 0, 500), 'AMOUNT_REQUIRED');
assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 600, 500), 'AMOUNT_EXCEEDS_DEBT');
assert.equal(
  validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.FULL, 400, 500),
  'FULL_PAYMENT_AMOUNT_MISMATCH',
);
assert.equal(validateEarlyPaymentAmount(BranchInstallmentEarlyPaymentType.FULL, 500, 500), null);

assert.equal(resolveEarlyPaymentApprovedAmount(BranchInstallmentEarlyPaymentType.FULL, 400, 500), 500);
assert.equal(resolveEarlyPaymentApprovedAmount(BranchInstallmentEarlyPaymentType.PARTIAL, 150, 500), 150);

assert.equal(canSendEarlyPaymentToCashier('APPROVED_BY_BRANCH_CEO' as never), true);
assert.equal(canSendEarlyPaymentToCashier('PENDING_BRANCH_CEO_APPROVAL' as never), false);
assert.equal(isEarlyPaymentSentToCashier('SENT_TO_CASHIER' as never), true);
assert.equal(isEarlyPaymentSentToCashier('APPROVED_BY_BRANCH_CEO' as never), false);

console.log('branch-installment-early-payment.util.test.ts: all tests passed');
