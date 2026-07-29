import { BranchPurchaseRequestStatus } from '@prisma/client';

/** User-facing workflow labels aligned with branch order business process. */
export type BranchPurchaseWorkflowLabel =
  | 'DRAFT'
  | 'WAITING_FOR_HQ_SALES_REVIEW'
  | 'WAITING_FOR_BRANCH_CONFIRMATION'
  | 'WAITING_FOR_BRANCH_ACCOUNTANT'
  | 'WAITING_FOR_BRANCH_PAYMENT'
  | 'WAITING_FOR_INSTALLMENT_APPROVAL'
  | 'INSTALLMENT_APPROVED'
  | 'WAITING_FOR_HQ_ACCOUNTANT_CONFIRMATION'
  | 'PAYMENT_CONFIRMED'
  | 'READY_FOR_HQ_WAREHOUSE'
  | 'SENT_TO_HQ_WAREHOUSE'
  | 'SHIPPED'
  | 'RECEIVED_BY_BRANCH'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'BRANCH_DECLINED';

export function resolveBranchPurchaseWorkflowLabel(
  status: BranchPurchaseRequestStatus,
): BranchPurchaseWorkflowLabel {
  switch (status) {
    case BranchPurchaseRequestStatus.DRAFT:
      return 'DRAFT';
    case BranchPurchaseRequestStatus.SUBMITTED:
    case BranchPurchaseRequestStatus.SUBMITTED_TO_HQ:
      return 'WAITING_FOR_HQ_SALES_REVIEW';
    case BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION:
      return 'WAITING_FOR_BRANCH_CONFIRMATION';
    case BranchPurchaseRequestStatus.BRANCH_CONFIRMED:
      return 'WAITING_FOR_BRANCH_ACCOUNTANT';
    case BranchPurchaseRequestStatus.PENDING_PAYMENT:
    case BranchPurchaseRequestStatus.PAYMENT_REJECTED:
      return 'WAITING_FOR_BRANCH_PAYMENT';
    case BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL:
      return 'WAITING_FOR_INSTALLMENT_APPROVAL';
    case BranchPurchaseRequestStatus.PAYMENT_SUBMITTED:
      return 'WAITING_FOR_HQ_ACCOUNTANT_CONFIRMATION';
    case BranchPurchaseRequestStatus.PAYMENT_CONFIRMED:
      return 'PAYMENT_CONFIRMED';
    case BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE:
      return 'READY_FOR_HQ_WAREHOUSE';
    case BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE:
    case BranchPurchaseRequestStatus.CONVERTED_TO_DISTRIBUTION_ORDER:
      return 'SENT_TO_HQ_WAREHOUSE';
    case BranchPurchaseRequestStatus.SHIPPED:
      return 'SHIPPED';
    case BranchPurchaseRequestStatus.RECEIVED:
    case BranchPurchaseRequestStatus.RECEIVED_WITH_DIFFERENCE:
      return 'RECEIVED_BY_BRANCH';
    case BranchPurchaseRequestStatus.COMPLETED:
      return 'COMPLETED';
    case BranchPurchaseRequestStatus.REJECTED:
      return 'REJECTED';
    case BranchPurchaseRequestStatus.APPROVED:
    case BranchPurchaseRequestStatus.PARTIALLY_APPROVED:
      return 'WAITING_FOR_BRANCH_CONFIRMATION';
    case BranchPurchaseRequestStatus.BRANCH_DECLINED:
      return 'BRANCH_DECLINED';
    case BranchPurchaseRequestStatus.CANCELLED:
      return 'CANCELLED';
    default:
      return 'DRAFT';
  }
}
