import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  PaymentStatus,
  SaleInstallmentApprovalStatus,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';

export const BRANCH_INSTALLMENT_DRAFT_DELETE_AUDIT = 'BRANCH_INSTALLMENT_DRAFT_DELETED';

export const INSTALLMENT_DRAFT_DELETE_BLOCKED_MESSAGE =
  'Продажу нельзя удалить на текущем этапе.';

export const INSTALLMENT_DRAFT_DELETE_STATUS_CHANGED_MESSAGE =
  'Продажу нельзя удалить, потому что её статус уже изменился. Обновите страницу.';

export type InstallmentDraftDeleteContext = {
  id: string;
  branchId: string;
  receiptNumber: string;
  status: SaleStatus;
  paymentType: SalePaymentType | null;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  sentToCashierAt: Date | null;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
  deletedAt: Date | null;
  installmentApproval?: {
    status: SaleInstallmentApprovalStatus;
    submittedAt: Date | null;
    submittedById: string | null;
    approvedAt: Date | null;
    approvedById: string | null;
    rejectedAt: Date | null;
    payments?: Array<{ id: string }>;
  } | null;
  payments?: Array<{ id: string }>;
  branchInvoice?: { id: string; deletedAt: Date | null } | null;
  salesCommissions?: Array<{ id: string }>;
  _count?: {
    payments?: number;
    salesCommissions?: number;
  };
};

export function isDeletableInstallmentDraft(sale: InstallmentDraftDeleteContext) {
  if (sale.deletedAt) return false;
  if (sale.status !== SaleStatus.DRAFT) return false;
  if (sale.paymentType !== SalePaymentType.INSTALLMENT) return false;
  if (!sale.installmentApproval) return false;
  if (sale.installmentApproval.status !== SaleInstallmentApprovalStatus.DRAFT) return false;
  if (sale.installmentApproval.submittedAt || sale.installmentApproval.submittedById) return false;
  if (sale.installmentApproval.approvedAt || sale.installmentApproval.approvedById) return false;
  if (sale.installmentApproval.rejectedAt) return false;
  if ((sale.installmentApproval.payments?.length ?? 0) > 0) return false;
  if (sale.finalizedAt || sale.cancelledAt) return false;
  if (sale.sentToCashierAt) return false;
  if (sale.paidAmount > 0.009) return false;
  if (sale.paymentStatus !== PaymentStatus.DEBT) return false;
  if (sale.branchInvoice && !sale.branchInvoice.deletedAt) return false;

  const paymentCount = sale._count?.payments ?? sale.payments?.length ?? 0;
  if (paymentCount > 0) return false;
  if ((sale._count?.salesCommissions ?? sale.salesCommissions?.length ?? 0) > 0) return false;

  return true;
}

export function assertCanDeleteInstallmentDraft(sale: InstallmentDraftDeleteContext) {
  if (!sale.installmentApproval) {
    throw new BadRequestException(INSTALLMENT_DRAFT_DELETE_BLOCKED_MESSAGE);
  }
  if (!isDeletableInstallmentDraft(sale)) {
    if (
      sale.status !== SaleStatus.DRAFT ||
      sale.installmentApproval.status !== SaleInstallmentApprovalStatus.DRAFT
    ) {
      throw new ConflictException(INSTALLMENT_DRAFT_DELETE_STATUS_CHANGED_MESSAGE);
    }
    throw new BadRequestException(INSTALLMENT_DRAFT_DELETE_BLOCKED_MESSAGE);
  }
}
