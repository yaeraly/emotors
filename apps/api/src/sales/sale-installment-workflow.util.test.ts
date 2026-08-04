import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentStatus, Role, SaleInstallmentApprovalStatus, SaleStatus } from '@prisma/client';
import {
  assertActorDidNotSubmitInstallmentRequest,
  assertCanSubmitInstallmentRequest,
  canBranchCeoApproveInstallment,
  canBranchCeoCancelInstallment,
  canBranchCeoRejectInstallment,
  canBranchCeoReturnInstallmentForRevision,
  canSubmitInstallmentRequest,
  INSTALLMENT_ALREADY_SUBMITTED_MESSAGE,
  INSTALLMENT_CANCELLATION_BLOCKED_MESSAGE,
  INSTALLMENT_DECISION_CONFLICT_MESSAGE,
  INSTALLMENT_SELF_DECISION_FORBIDDEN_MESSAGE,
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

  it('branch CEO can return pending requests for revision', () => {
    assert.equal(
      canBranchCeoReturnInstallmentForRevision(SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL),
      true,
    );
    assert.equal(canBranchCeoReturnInstallmentForRevision(SaleInstallmentApprovalStatus.APPROVED), false);
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

  it('submission is allowed from draft, rejected, or cancelled requests', () => {
    assert.equal(canSubmitInstallmentRequest(SaleInstallmentApprovalStatus.DRAFT), true);
    assert.equal(canSubmitInstallmentRequest(SaleInstallmentApprovalStatus.REJECTED), true);
    assert.equal(canSubmitInstallmentRequest(SaleInstallmentApprovalStatus.CANCELLED), true);
  });

  it('submission is blocked while already pending branch CEO decision', () => {
    assert.equal(
      canSubmitInstallmentRequest(SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL),
      false,
    );
    assert.throws(
      () => assertCanSubmitInstallmentRequest(SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL),
      new RegExp(INSTALLMENT_ALREADY_SUBMITTED_MESSAGE),
    );
  });

  it('resubmitting an already-decided request raises the decision conflict message', () => {
    assert.throws(
      () => assertCanSubmitInstallmentRequest(SaleInstallmentApprovalStatus.APPROVED),
      new RegExp(INSTALLMENT_DECISION_CONFLICT_MESSAGE),
    );
    assert.throws(
      () => assertCanSubmitInstallmentRequest(SaleInstallmentApprovalStatus.ACTIVE),
      new RegExp(INSTALLMENT_DECISION_CONFLICT_MESSAGE),
    );
  });

  it('repeated submission of a draft request does not throw (idempotent re-send)', () => {
    assert.doesNotThrow(() => assertCanSubmitInstallmentRequest(SaleInstallmentApprovalStatus.DRAFT));
  });

  it('Branch Sales Manager cannot approve, reject, or cancel their own submitted request', () => {
    assert.throws(
      () => assertActorDidNotSubmitInstallmentRequest('user-1', 'user-1'),
      new RegExp(INSTALLMENT_SELF_DECISION_FORBIDDEN_MESSAGE),
    );
  });

  it('Branch CEO who did not submit the request may act on it', () => {
    assert.doesNotThrow(() => assertActorDidNotSubmitInstallmentRequest('user-1', 'user-2'));
    assert.doesNotThrow(() => assertActorDidNotSubmitInstallmentRequest(null, 'user-2'));
    assert.doesNotThrow(() => assertActorDidNotSubmitInstallmentRequest(undefined, 'user-2'));
  });
});
