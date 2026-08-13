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
      return 'sales.installmentPendingHq';
    case 'PENDING_BRANCH_CEO_APPROVAL':
      return 'sales.installmentPendingCeo';
    case 'APPROVED':
      return 'sales.installmentApproved';
    case 'REJECTED':
      return 'sales.installmentRejected';
    case 'CANCELLED':
      return 'sales.installmentCancelled';
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

export function isPendingBranchCeoInstallmentDecision(
  status: SaleInstallmentApprovalStatus | undefined,
) {
  return status === 'PENDING_BRANCH_CEO_APPROVAL';
}

export function canBranchCeoCancelInstallmentRequest(
  approval: Pick<SaleInstallmentApproval, 'status'> | null | undefined,
  sale: Pick<Sale, 'status' | 'paidAmount' | 'paymentStatus'> | null | undefined,
) {
  if (!approval || !sale) return false;
  if (approval.status === 'CANCELLED' || approval.status === 'REJECTED') return false;
  if (approval.status === 'ACTIVE' || approval.status === 'PAID') return false;
  if (sale.status === 'FINALIZED' || sale.status === 'CANCELLED') return false;
  if (Number(sale.paidAmount) > 0.009) return false;
  if (sale.paymentStatus === 'PAID' || sale.paymentStatus === 'PARTIAL') return false;
  return (
    isPendingBranchCeoInstallmentDecision(approval.status) ||
    approval.status === 'PENDING_APPROVAL' ||
    approval.status === 'APPROVED'
  );
}

export function canReturnInstallmentForRevision(
  approval: Pick<SaleInstallmentApproval, 'status'> | null | undefined,
) {
  return isPendingBranchCeoInstallmentDecision(approval?.status);
}

export function canReturnRejectedSaleToDraft(
  approval: Pick<SaleInstallmentApproval, 'status'> | null | undefined,
) {
  return approval?.status === 'REJECTED' || approval?.status === 'CANCELLED';
}

export function isDeletableInstallmentDraft(
  sale: Pick<
    Sale,
    | 'status'
    | 'deletedAt'
    | 'paymentType'
    | 'paidAmount'
    | 'paymentStatus'
    | 'sentToCashierAt'
    | 'installmentApproval'
  > & {
    branchInvoice?: { id: string; deletedAt?: string | null } | null;
    payments?: Array<{ id: string }>;
  },
) {
  if (sale.deletedAt) return false;
  if (sale.status !== 'DRAFT') return false;
  if (sale.paymentType !== 'INSTALLMENT') return false;
  if (!sale.installmentApproval) return false;
  if (sale.installmentApproval.status !== 'DRAFT') return false;
  if (sale.installmentApproval.submittedAt) return false;
  if (sale.installmentApproval.approvedAt) return false;
  if (sale.installmentApproval.rejectedAt) return false;
  if (sale.sentToCashierAt) return false;
  if (Number(sale.paidAmount) > 0.009) return false;
  if (sale.paymentStatus !== 'DEBT') return false;
  if (sale.branchInvoice && !sale.branchInvoice.deletedAt) return false;
  if ((sale.payments?.length ?? 0) > 0) return false;
  return true;
}

export function computeRemainingDebt(totalAmount: number, downPayment: number) {
  return Math.max(Math.round((totalAmount - downPayment + Number.EPSILON) * 100) / 100, 0);
}
