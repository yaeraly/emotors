import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getCargoBillActionVisibility,
  resolveBillRemainingForActions,
} from './cargo-bill-actions';

describe('cargo-bill-actions supplier parity', () => {
  it('waiting supplier invoice shows all four actions', () => {
    const visibility = getCargoBillActionVisibility({
      uiStatus: 'AWAITING_ACCOUNTANT',
      paidAmount: 0,
      remainingAmount: 800000,
    });
    assert.equal(visibility.showPayFull, true);
    assert.equal(visibility.showPartial, true);
    assert.equal(visibility.showPostpone, true);
    assert.equal(visibility.showReturnForCorrection, true);
  });

  it('falls back to CNY remaining when KGS remaining is 0', () => {
    assert.equal(
      resolveBillRemainingForActions({ remainingAmountKgs: 0, remainingAmount: 80000 }),
      80000,
    );
  });

  it('hides actions when already sent to cashier (APPROVED)', () => {
    const visibility = getCargoBillActionVisibility({
      uiStatus: 'APPROVED',
      paidAmount: 0,
      remainingAmount: 800000,
    });
    assert.equal(visibility.showPayFull, false);
    assert.equal(visibility.showPartial, false);
    assert.equal(visibility.showPostpone, false);
    assert.equal(visibility.showReturnForCorrection, false);
  });

  it('partially paid shows remainder/partial/postpone', () => {
    const visibility = getCargoBillActionVisibility({
      uiStatus: 'PARTIALLY_PAID',
      paidAmount: 300000,
      remainingAmount: 500000,
    });
    assert.equal(visibility.showPayRemainder, true);
    assert.equal(visibility.showPartial, true);
    assert.equal(visibility.showPostpone, true);
    assert.equal(visibility.showReturnForCorrection, false);
  });

  it('cashier-returned cargo shows return to supply manager and resend partial', () => {
    const visibility = getCargoBillActionVisibility({
      uiStatus: 'RETURNED',
      paidAmount: 0,
      remainingAmount: 800000,
      executionStatus: 'RETURNED_TO_ACCOUNTANT',
    });
    assert.equal(visibility.showReturnForCorrection, true);
    assert.equal(visibility.showPartial, true);
    assert.equal(visibility.showCashierReturnedBanner, true);
    assert.equal(visibility.showAwaitingCorrectionBanner, false);
  });
});
