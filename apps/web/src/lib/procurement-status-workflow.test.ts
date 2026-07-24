import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getProcurementStatusButtonState, canShowKyrgyzstanLogistics } from './procurement-status-workflow';

describe('getProcurementStatusButtonState with supplier payment', () => {
  it('keeps later stages blocked when nothing is paid', () => {
    assert.equal(
      getProcurementStatusButtonState('SENT_TO_SUPPLIER', { path: 'mark-production', status: 'IN_PRODUCTION' }, {
        supplierPaymentStatus: 'UNPAID',
      }),
      'unavailable',
    );
  });

  it('unlocks production after partial supplier payment', () => {
    assert.equal(
      getProcurementStatusButtonState('SENT_TO_SUPPLIER', { path: 'mark-production', status: 'IN_PRODUCTION' }, {
        supplierPaymentStatus: 'PARTIALLY_PAID',
      }),
      'next',
    );
  });

  it('allows continuing from IN_PRODUCTION after partial payment', () => {
    assert.equal(
      getProcurementStatusButtonState('IN_PRODUCTION', { path: 'mark-shipped-to-yiwu', status: 'SHIPPED_TO_YIWU' }, {
        supplierPaymentStatus: 'PARTIALLY_PAID',
      }),
      'next',
    );
  });

  it('allows continuing from SHIPPED_TO_YIWU after partial payment', () => {
    assert.equal(
      getProcurementStatusButtonState('SHIPPED_TO_YIWU', { path: 'mark-in-transit', status: 'IN_TRANSIT' }, {
        supplierPaymentStatus: 'PARTIALLY_PAID',
      }),
      'next',
    );
  });

  it('allows arrival after partial payment while in transit', () => {
    assert.equal(
      getProcurementStatusButtonState('IN_TRANSIT', { path: 'mark-arrived', status: 'ARRIVED' }, {
        supplierPaymentStatus: 'PARTIALLY_PAID',
      }),
      'next',
    );
  });

  it('does not reset workflow when payment becomes full later', () => {
    assert.equal(
      getProcurementStatusButtonState('IN_PRODUCTION', { path: 'mark-shipped-to-yiwu', status: 'SHIPPED_TO_YIWU' }, {
        supplierPaymentStatus: 'PAID',
      }),
      'next',
    );
    assert.equal(
      getProcurementStatusButtonState('IN_PRODUCTION', { path: 'mark-paid', status: 'PAID' }, {
        supplierPaymentStatus: 'PAID',
      }),
      'completed',
    );
  });
});

describe('canShowKyrgyzstanLogistics', () => {
  it('hides cargo and Kyrgyzstan logistics sections before arrival', () => {
    for (const status of [
      'APPROVED',
      'ORDERED',
      'SENT_TO_SUPPLIER',
      'PAID',
      'IN_PRODUCTION',
      'SHIPPED_TO_YIWU',
      'IN_TRANSIT',
    ]) {
      assert.equal(canShowKyrgyzstanLogistics(status), false, status);
    }
  });

  it('shows cargo and Kyrgyzstan logistics sections after arrival is saved', () => {
    assert.equal(canShowKyrgyzstanLogistics('ARRIVED'), true);
    assert.equal(canShowKyrgyzstanLogistics('ARRIVED_IN_KYRGYZSTAN'), true);
    assert.equal(canShowKyrgyzstanLogistics('RECEIVED_TO_HQ_WAREHOUSE'), true);
  });
});
