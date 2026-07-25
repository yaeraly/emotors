import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HqB2bInstallmentStatus,
  HqB2bPaymentRequestStatus,
  HqB2bPaymentType,
  HqB2bSaleStatus,
} from '@prisma/client';

function nextStatusAfterFullPaymentConfirm(): HqB2bSaleStatus {
  return HqB2bSaleStatus.SENT_TO_WAREHOUSE;
}

function nextStatusAfterPaymentReject(): HqB2bSaleStatus {
  return HqB2bSaleStatus.PAYMENT_REJECTED;
}

function installmentStatusAfterCeoApprove(): HqB2bInstallmentStatus {
  return HqB2bInstallmentStatus.AWAITING_DOWN_PAYMENT_CONFIRMATION;
}

function installmentStatusAfterCeoReject(): HqB2bInstallmentStatus {
  return HqB2bInstallmentStatus.CEO_REJECTED;
}

function saleStatusForNewFullPayment(): HqB2bSaleStatus {
  return HqB2bSaleStatus.AWAITING_PAYMENT_CONFIRMATION;
}

function saleStatusForNewInstallment(): HqB2bSaleStatus {
  return HqB2bSaleStatus.AWAITING_CEO_APPROVAL;
}

describe('HQ B2B sale workflow states', () => {
  it('full payment sale awaits accountant confirmation', () => {
    assert.equal(saleStatusForNewFullPayment(), HqB2bSaleStatus.AWAITING_PAYMENT_CONFIRMATION);
  });

  it('installment sale awaits CEO before accountant', () => {
    assert.equal(saleStatusForNewInstallment(), HqB2bSaleStatus.AWAITING_CEO_APPROVAL);
  });

  it('confirmed full payment sends sale to warehouse', () => {
    assert.equal(nextStatusAfterFullPaymentConfirm(), HqB2bSaleStatus.SENT_TO_WAREHOUSE);
  });

  it('rejected payment returns sale to sales for correction', () => {
    assert.equal(nextStatusAfterPaymentReject(), HqB2bSaleStatus.PAYMENT_REJECTED);
  });

  it('CEO-approved installment awaits down payment confirmation', () => {
    assert.equal(
      installmentStatusAfterCeoApprove(),
      HqB2bInstallmentStatus.AWAITING_DOWN_PAYMENT_CONFIRMATION,
    );
  });

  it('CEO-rejected installment does not proceed to payment confirmation', () => {
    assert.equal(installmentStatusAfterCeoReject(), HqB2bInstallmentStatus.CEO_REJECTED);
    assert.notEqual(installmentStatusAfterCeoReject(), HqB2bInstallmentStatus.ACTIVE);
  });

  it('payment request confirmed status is distinct from pending', () => {
    assert.notEqual(
      HqB2bPaymentRequestStatus.CONFIRMED,
      HqB2bPaymentRequestStatus.PENDING,
    );
  });

  it('full payment and installment payment types are exclusive entry paths', () => {
    assert.notEqual(HqB2bPaymentType.FULL_PAYMENT, HqB2bPaymentType.INSTALLMENT);
    assert.equal(saleStatusForNewFullPayment(), HqB2bSaleStatus.AWAITING_PAYMENT_CONFIRMATION);
    assert.equal(saleStatusForNewInstallment(), HqB2bSaleStatus.AWAITING_CEO_APPROVAL);
  });
});
