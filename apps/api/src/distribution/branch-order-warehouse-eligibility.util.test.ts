import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BranchDistributionOrderStatus,
  BranchOrderInstallmentStatus,
} from '@prisma/client';
import {
  canStartHqWarehouseFulfillment,
  isBranchOrderEligibleForHqWarehouse,
  isZeroInitialApprovedInstallment,
} from './branch-order-warehouse-eligibility.util';

describe('branch-order-warehouse-eligibility.util', () => {
  it('installment request is invisible / blocked before HQ CEO approval', () => {
    assert.equal(
      isBranchOrderEligibleForHqWarehouse(
        { status: BranchDistributionOrderStatus.INVOICED },
        { status: BranchOrderInstallmentStatus.PENDING, firstPaymentRequired: false, firstPaymentAmount: 0 },
      ),
      false,
    );
    assert.equal(
      canStartHqWarehouseFulfillment(
        { status: BranchDistributionOrderStatus.INVOICED },
        { status: BranchOrderInstallmentStatus.PENDING },
      ).reason,
      'INSTALLMENT_PENDING',
    );
  });

  it('HQ CEO approval makes zero-initial installment warehouse-eligible', () => {
    assert.equal(
      isBranchOrderEligibleForHqWarehouse(
        { status: BranchDistributionOrderStatus.INVOICED },
        { status: BranchOrderInstallmentStatus.APPROVED, firstPaymentRequired: false, firstPaymentAmount: 0 },
      ),
      true,
    );
    assert.equal(
      isZeroInitialApprovedInstallment({
        status: BranchOrderInstallmentStatus.APPROVED,
        firstPaymentRequired: false,
        firstPaymentAmount: 0,
      }),
      true,
    );
  });

  it('full payment PAID remains warehouse-eligible', () => {
    assert.equal(
      isBranchOrderEligibleForHqWarehouse({ status: BranchDistributionOrderStatus.PAID }, null),
      true,
    );
  });

  it('rejected installment never reaches warehouse', () => {
    assert.equal(
      isBranchOrderEligibleForHqWarehouse(
        { status: BranchDistributionOrderStatus.INVOICED },
        { status: BranchOrderInstallmentStatus.REJECTED },
      ),
      false,
    );
    assert.equal(
      canStartHqWarehouseFulfillment(
        { status: BranchDistributionOrderStatus.INVOICED },
        { status: BranchOrderInstallmentStatus.REJECTED },
      ).reason,
      'INSTALLMENT_REJECTED',
    );
  });

  it('non-zero approved installment is warehouse-eligible without requiring PAID', () => {
    assert.equal(
      isBranchOrderEligibleForHqWarehouse(
        { status: BranchDistributionOrderStatus.PAYMENT_PENDING },
        {
          status: BranchOrderInstallmentStatus.APPROVED,
          firstPaymentRequired: true,
          firstPaymentConfirmed: false,
          firstPaymentAmount: 1000,
        },
      ),
      true,
    );
  });
});
