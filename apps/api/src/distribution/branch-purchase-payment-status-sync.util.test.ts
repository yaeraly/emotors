import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchOrderInstallmentStatus,
  BranchPurchaseRequestStatus,
} from '@prisma/client';
import { resolveBranchDisplayStatus } from '../operations/branch-purchase-request.presenter';
import {
  resolveBranchPurchaseRequestStatusForPaymentEvent,
  shouldRepairBprStatusForRejectedInstallment,
} from './branch-purchase-payment-status-sync.util';

describe('branch purchase payment status sync (BPR-1786349778733 installment rejection)', () => {
  it('INSTALLMENT_REJECTED maps linked BPR to REJECTED not PENDING_PAYMENT', () => {
    const next = resolveBranchPurchaseRequestStatusForPaymentEvent(
      'INSTALLMENT_REJECTED',
      BranchOrderInstallmentStatus.REJECTED,
    );
    assert.equal(next, BranchPurchaseRequestStatus.REJECTED);
    assert.notEqual(next, BranchPurchaseRequestStatus.PENDING_PAYMENT);
  });

  it('full-payment invoice sent still maps to PENDING_PAYMENT', () => {
    assert.equal(
      resolveBranchPurchaseRequestStatusForPaymentEvent('INVOICE_SENT', null),
      BranchPurchaseRequestStatus.PENDING_PAYMENT,
    );
    assert.equal(
      resolveBranchPurchaseRequestStatusForPaymentEvent('SENT_TO_CASHIER', null),
      BranchPurchaseRequestStatus.PENDING_PAYMENT,
    );
  });

  it('installment pending maps to PENDING_INSTALLMENT_APPROVAL', () => {
    assert.equal(
      resolveBranchPurchaseRequestStatusForPaymentEvent(
        'INSTALLMENT_PENDING',
        BranchOrderInstallmentStatus.PENDING,
      ),
      BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
    );
  });

  it('Branch Sales display shows REJECTED after installment rejection (not WAITING_FOR_PAYMENT)', () => {
    const display = resolveBranchDisplayStatus(BranchPurchaseRequestStatus.REJECTED, []);
    assert.equal(display, 'REJECTED');
    assert.notEqual(display, 'WAITING_FOR_PAYMENT');
  });

  it('repair detects stale awaiting-payment BPR with rejected installment', () => {
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: BranchPurchaseRequestStatus.PENDING_PAYMENT,
        installmentStatus: BranchOrderInstallmentStatus.REJECTED,
      }),
      true,
    );
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
        installmentStatus: BranchOrderInstallmentStatus.REJECTED,
      }),
      true,
    );
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: BranchPurchaseRequestStatus.REJECTED,
        installmentStatus: BranchOrderInstallmentStatus.REJECTED,
      }),
      false,
    );
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: BranchPurchaseRequestStatus.PENDING_PAYMENT,
        installmentStatus: BranchOrderInstallmentStatus.APPROVED,
      }),
      false,
    );
  });
});
