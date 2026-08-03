import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PaymentStatus, SaleInstallmentApprovalStatus, SaleStatus } from '@prisma/client';

export const BRANCH_CEO_PENDING_STATUSES: SaleInstallmentApprovalStatus[] = [
  SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
];

/** Statuses from which a new submission may (re)start the Branch CEO approval flow. */
export const SUBMITTABLE_INSTALLMENT_STATUSES: SaleInstallmentApprovalStatus[] = [
  SaleInstallmentApprovalStatus.DRAFT,
  SaleInstallmentApprovalStatus.REJECTED,
  SaleInstallmentApprovalStatus.CANCELLED,
];

export const INSTALLMENT_DECISION_CONFLICT_MESSAGE =
  'Решение по этой рассрочке уже принято. Обновите страницу.';

export const INSTALLMENT_ALREADY_SUBMITTED_MESSAGE =
  'Заявка на рассрочку уже отправлена и ожидает решения Branch CEO.';

export const INSTALLMENT_CANCELLATION_BLOCKED_MESSAGE =
  'Рассрочку нельзя отменить на текущем этапе.';

export const INSTALLMENT_SELF_DECISION_FORBIDDEN_MESSAGE =
  'Нельзя принимать решение по собственной заявке на рассрочку.';

export function isPendingBranchCeoInstallmentDecision(status: SaleInstallmentApprovalStatus) {
  return BRANCH_CEO_PENDING_STATUSES.includes(status);
}

export function canBranchCeoApproveInstallment(status: SaleInstallmentApprovalStatus) {
  return isPendingBranchCeoInstallmentDecision(status);
}

export function canBranchCeoRejectInstallment(status: SaleInstallmentApprovalStatus) {
  return isPendingBranchCeoInstallmentDecision(status);
}

export function canBranchCeoCancelInstallment(input: {
  approvalStatus: SaleInstallmentApprovalStatus;
  saleStatus: SaleStatus;
  salePaidAmount: number;
  salePaymentStatus: PaymentStatus;
}) {
  if (input.approvalStatus === SaleInstallmentApprovalStatus.CANCELLED) {
    return false;
  }
  if (input.approvalStatus === SaleInstallmentApprovalStatus.REJECTED) {
    return false;
  }
  if (input.approvalStatus === SaleInstallmentApprovalStatus.ACTIVE) {
    return false;
  }
  if (input.approvalStatus === SaleInstallmentApprovalStatus.PAID) {
    return false;
  }
  if (input.saleStatus === SaleStatus.FINALIZED || input.saleStatus === SaleStatus.CANCELLED) {
    return false;
  }
  if (input.salePaidAmount > 0.009) {
    return false;
  }
  if (
    input.salePaymentStatus === PaymentStatus.PAID ||
    input.salePaymentStatus === PaymentStatus.PARTIAL
  ) {
    return false;
  }

  return (
    isPendingBranchCeoInstallmentDecision(input.approvalStatus) ||
    input.approvalStatus === SaleInstallmentApprovalStatus.PENDING_APPROVAL ||
    input.approvalStatus === SaleInstallmentApprovalStatus.APPROVED
  );
}

export function resolveStatusAfterBranchCeoApproval() {
  // Branch retail sale installments do not have a separate HQ CEO approval stage.
  return SaleInstallmentApprovalStatus.APPROVED;
}

export function canSubmitInstallmentRequest(status: SaleInstallmentApprovalStatus) {
  return SUBMITTABLE_INSTALLMENT_STATUSES.includes(status);
}

export function assertCanSubmitInstallmentRequest(status: SaleInstallmentApprovalStatus) {
  if (canSubmitInstallmentRequest(status)) {
    return;
  }
  if (
    isPendingBranchCeoInstallmentDecision(status) ||
    status === SaleInstallmentApprovalStatus.PENDING_APPROVAL
  ) {
    throw new ConflictException(INSTALLMENT_ALREADY_SUBMITTED_MESSAGE);
  }
  throw new ConflictException(INSTALLMENT_DECISION_CONFLICT_MESSAGE);
}

export function assertBranchCeoCanApproveInstallment(status: SaleInstallmentApprovalStatus) {
  if (!canBranchCeoApproveInstallment(status)) {
    throw new ConflictException(INSTALLMENT_DECISION_CONFLICT_MESSAGE);
  }
}

export function assertBranchCeoCanRejectInstallment(status: SaleInstallmentApprovalStatus) {
  if (!canBranchCeoRejectInstallment(status)) {
    throw new ConflictException(INSTALLMENT_DECISION_CONFLICT_MESSAGE);
  }
}

export function assertBranchCeoCanCancelInstallment(input: {
  approvalStatus: SaleInstallmentApprovalStatus;
  saleStatus: SaleStatus;
  salePaidAmount: number;
  salePaymentStatus: PaymentStatus;
}) {
  if (!canBranchCeoCancelInstallment(input)) {
    throw new BadRequestException(INSTALLMENT_CANCELLATION_BLOCKED_MESSAGE);
  }
}

/** Branch Sales Manager cannot approve, reject, or cancel a request they submitted themselves. */
export function assertActorDidNotSubmitInstallmentRequest(
  submittedById: string | null | undefined,
  actorUserId: string,
) {
  if (submittedById && submittedById === actorUserId) {
    throw new ForbiddenException(INSTALLMENT_SELF_DECISION_FORBIDDEN_MESSAGE);
  }
}

export function validateInstallmentTerms(input: {
  totalAmount: number;
  initialPayment: number;
  financedAmount: number;
  dueDate: Date | null;
}) {
  if (input.totalAmount <= 0) {
    throw new BadRequestException('Сумма продажи должна быть больше нуля');
  }
  if (input.initialPayment < 0) {
    throw new BadRequestException('Первоначальный взнос не может быть отрицательным');
  }
  if (input.initialPayment > input.totalAmount + 0.009) {
    throw new BadRequestException('Первоначальный взнос не может превышать сумму продажи');
  }
  const expectedRemaining = Math.round((input.totalAmount - input.initialPayment) * 100) / 100;
  if (Math.abs(expectedRemaining - input.financedAmount) > 0.02) {
    throw new BadRequestException('Остаток по рассрочке не совпадает с условиями продажи');
  }
  if (!input.dueDate) {
    throw new BadRequestException('Укажите срок рассрочки');
  }
}
