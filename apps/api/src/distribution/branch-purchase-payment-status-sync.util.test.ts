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

describe('branch purchase payment status sync (HQ CEO installment rejection)', () => {
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
    assert.notEqual(display, 'INSTALLMENT_REQUESTED');
  });

  it('repair detects any non-terminal stale BPR with rejected installment', () => {
    const staleStatuses = [
      BranchPurchaseRequestStatus.PENDING_PAYMENT,
      BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
      BranchPurchaseRequestStatus.PAYMENT_REJECTED,
      BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
      BranchPurchaseRequestStatus.PAYMENT_SUBMITTED,
      BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
    ];
    for (const bprStatus of staleStatuses) {
      assert.equal(
        shouldRepairBprStatusForRejectedInstallment({
          bprStatus,
          installmentStatus: BranchOrderInstallmentStatus.REJECTED,
        }),
        true,
        `expected repair for ${bprStatus}`,
      );
    }
  });

  it('does not repair already rejected or terminal BPR rows', () => {
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: BranchPurchaseRequestStatus.REJECTED,
        installmentStatus: BranchOrderInstallmentStatus.REJECTED,
      }),
      false,
    );
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: BranchPurchaseRequestStatus.COMPLETED,
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

describe('BPR-1786349778733 / BPR-1786365940215 rejection pattern', () => {
  it('stale PENDING_PAYMENT + rejected installment must become REJECTED → Отклонён display', () => {
    const before = BranchPurchaseRequestStatus.PENDING_PAYMENT;
    assert.equal(
      shouldRepairBprStatusForRejectedInstallment({
        bprStatus: before,
        installmentStatus: BranchOrderInstallmentStatus.REJECTED,
      }),
      true,
    );
    const after = resolveBranchPurchaseRequestStatusForPaymentEvent(
      'INSTALLMENT_REJECTED',
      BranchOrderInstallmentStatus.REJECTED,
    );
    assert.equal(after, BranchPurchaseRequestStatus.REJECTED);
    assert.equal(resolveBranchDisplayStatus(after!, []), 'REJECTED');
  });
});
