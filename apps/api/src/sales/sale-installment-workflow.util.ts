import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentStatus, SaleInstallmentApprovalStatus, SaleStatus } from '@prisma/client';

export const BRANCH_CEO_PENDING_STATUSES: SaleInstallmentApprovalStatus[] = [
  SaleInstallmentApprovalStatus.PENDING_BRANCH_CEO_APPROVAL,
];

export const INSTALLMENT_DECISION_CONFLICT_MESSAGE =
  'Решение по этой рассрочке уже принято. Обновите страницу.';

export const INSTALLMENT_CANCELLATION_BLOCKED_MESSAGE =
  'Рассрочку нельзя отменить на текущем этапе.';

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
