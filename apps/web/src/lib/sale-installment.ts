import type { Sale, SaleInstallmentApproval, SaleInstallmentApprovalStatus } from './types';

export function saleIsInstallment(
  sale: Pick<Sale, 'debtAmount' | 'installments'> | null | undefined,
) {
  if (!sale) return false;
  return Number(sale.debtAmount) > 0.009 && (sale.installments?.length ?? 0) > 0;
}

export function draftLooksLikeInstallment(
  debtAmount: number,
  installmentDays: string,
  dueDate: string,
) {
  return debtAmount > 0.009 && (Boolean(installmentDays) || Boolean(dueDate));
}

export function canCompleteInstallmentSale(
  approval: SaleInstallmentApproval | null | undefined,
) {
  return approval?.status === 'APPROVED';
}

export function installmentBlocksCompletion(
  sale: Pick<Sale, 'debtAmount' | 'installments' | 'installmentApproval'> | null | undefined,
) {
  if (!saleIsInstallment(sale)) return false;
  return !canCompleteInstallmentSale(sale?.installmentApproval);
}

export function installmentStatusLabelKey(
  status: SaleInstallmentApprovalStatus | undefined,
): string | null {
  switch (status) {
    case 'PENDING_BRANCH_CEO_APPROVAL':
      return 'sales.installmentPendingCeo';
    case 'APPROVED':
      return 'sales.installmentApproved';
    case 'REJECTED':
      return 'sales.installmentRejected';
    case 'DRAFT':
      return 'sales.installmentDraft';
    default:
      return null;
  }
}
