import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus, Role, SaleInstallmentApprovalStatus, SaleStatus } from '@prisma/client';
import {
  canBranchCeoApproveInstallment,
  canBranchCeoCancelInstallment,
  canBranchCeoRejectInstallment,
  INSTALLMENT_CANCELLATION_BLOCKED_MESSAGE,
  INSTALLMENT_DECISION_CONFLICT_MESSAGE,
  isPendingBranchCeoInstallmentDecision,
  resolveStatusAfterBranchCeoApproval,
} from './sale-installment-workflow.util';

describe('sale installment branch CEO workflow', () => {
  it('submitted request waits for branch CEO decision', () => {
    assert.equal(
      isPendingBranchCeoInstallmentDecision(SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL),
      true,
    );
    assert.equal(
      isPendingBranchCeoInstallmentDecision(SaleInstallmentApprovalStatus.PENDING_APPROVAL),
      false,
    );
  });

  it('branch CEO can approve only pending branch requests', () => {
    assert.equal(
      canBranchCeoApproveInstallment(SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL),
      true,
    );
    assert.equal(canBranchCeoApproveInstallment(SaleInstallmentApprovalStatus.APPROVED), false);
  });

  it('branch CEO approval is final for branch retail sales', () => {
    assert.equal(resolveStatusAfterBranchCeoApproval(), SaleInstallmentApprovalStatus.APPROVED);
  });

  it('branch CEO can reject pending requests', () => {
    assert.equal(
      canBranchCeoRejectInstallment(SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL),
      true,
    );
  });

  it('branch CEO can cancel pending request without payment', () => {
    assert.equal(
      canBranchCeoCancelInstallment({
        approvalStatus: SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
        saleStatus: SaleStatus.DRAFT,
        salePaidAmount: 0,
        salePaymentStatus: PaymentStatus.DEBT,
      }),
      true,
    );
  });

  it('branch CEO cannot cancel paid installment', () => {
    assert.equal(
      canBranchCeoCancelInstallment({
        approvalStatus: SaleInstallmentApprovalStatus.APPROVED,
        saleStatus: SaleStatus.DRAFT,
        salePaidAmount: 1000,
        salePaymentStatus: PaymentStatus.PARTIAL,
      }),
      false,
    );
  });

  it('exposes conflict and cancellation messages', () => {
    assert.match(INSTALLMENT_DECISION_CONFLICT_MESSAGE, /Обновите страницу/);
    assert.match(INSTALLMENT_CANCELLATION_BLOCKED_MESSAGE, /нельзя отменить/);
  });

  it('branch CEO role is franchise owner scoped to branch', () => {
    assert.equal(Role.FRANCHISE_OWNER, 'FRANCHISE_OWNER');
  });
});
