import { BranchPurchaseRequestStatus } from '@prisma/client';

export const HQ_BRANCH_ORDER_LINE_REVIEW_EDITABLE_STATUSES = new Set<BranchPurchaseRequestStatus>([
  BranchPurchaseRequestStatus.SUBMITTED,
  BranchPurchaseRequestStatus.SUBMITTED_TO_HQ,
]);

export const BRANCH_ORDER_LINE_REVIEW_DOWNSTREAM_LOCKED_STATUSES = new Set<BranchPurchaseRequestStatus>([
  BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
  BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
  BranchPurchaseRequestStatus.BRANCH_DECLINED,
  BranchPurchaseRequestStatus.PENDING_PAYMENT,
  BranchPurchaseRequestStatus.PAYMENT_SUBMITTED,
  BranchPurchaseRequestStatus.PAYMENT_CONFIRMED,
  BranchPurchaseRequestStatus.PAYMENT_REJECTED,
  BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
  BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
  BranchPurchaseRequestStatus.CONVERTED_TO_DISTRIBUTION_ORDER,
  BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE,
  BranchPurchaseRequestStatus.SHIPPED,
  BranchPurchaseRequestStatus.RECEIVED,
  BranchPurchaseRequestStatus.RECEIVED_WITH_DIFFERENCE,
  BranchPurchaseRequestStatus.COMPLETED,
]);

export function canEditBranchPurchaseLineReview(request: {
  status: BranchPurchaseRequestStatus;
  convertedOrderId?: string | null;
}) {
  if (request.convertedOrderId) return false;
  return HQ_BRANCH_ORDER_LINE_REVIEW_EDITABLE_STATUSES.has(request.status);
}

export function assertBranchPurchaseLineReviewEditable(request: {
  status: BranchPurchaseRequestStatus;
  convertedOrderId?: string | null;
}) {
  if (canEditBranchPurchaseLineReview(request)) {
    return;
  }
  throw new Error('BRANCH_ORDER_LINE_REVIEW_LOCKED_DOWNSTREAM');
}
