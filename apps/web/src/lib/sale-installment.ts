import type { Sale, SaleInstallmentApproval, SaleInstallmentApprovalStatus } from './types';

export function saleIsInstallment(sale: Pick<Sale, 'installmentApproval'> | null | undefined) {
  return Boolean(sale?.installmentApproval);
}

export function draftLooksLikeInstallment(
  paymentType: string,
  finalPaymentDate: string,
  totalAmount: number,
) {
  return paymentType === 'INSTALLMENT' && Boolean(finalPaymentDate) && totalAmount > 0;
}

export function canCompleteInstallmentSale(
  approval: SaleInstallmentApproval | null | undefined,
) {
  return approval?.status === 'APPROVED' || approval?.status === 'ACTIVE';
}

export function installmentBlocksCompletion(
  sale: Pick<Sale, 'installmentApproval'> | null | undefined,
  paymentType?: string,
) {
  const isInstallment = paymentType === 'INSTALLMENT' || saleIsInstallment(sale);
  if (!isInstallment) return false;
  const status = sale?.installmentApproval?.status;
  return status !== 'APPROVED' && status !== 'ACTIVE';
}

export function installmentStatusLabelKey(
  status: SaleInstallmentApprovalStatus | undefined,
): string | null {
  switch (status) {
    case 'PENDING_APPROVAL':
    case 'PENDING_BRANCH_CEO_APPROVAL':
      return 'sales.installmentPendingCeo';
    case 'APPROVED':
      return 'sales.installmentApproved';
    case 'REJECTED':
      return 'sales.installmentRejected';
    case 'ACTIVE':
      return 'sales.installmentActive';
    case 'PAID':
      return 'sales.installmentPaid';
    case 'DRAFT':
      return 'sales.installmentDraft';
    default:
      return null;
  }
}

export function computeRemainingDebt(totalAmount: number, downPayment: number) {
  return Math.max(Math.round((totalAmount - downPayment + Number.EPSILON) * 100) / 100, 0);
}
