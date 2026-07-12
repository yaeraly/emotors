import { BranchPurchaseRequestStatus } from '@prisma/client';
import { canManageOwnBranchProductRequest } from '../rbac/rbac';
import type { AuthUser } from '../auth/auth.types';

export function canSeeHqStockInBranchRequests(user: AuthUser, canViewAll: boolean) {
  return canViewAll;
}

export function isBranchOnlyRequestUser(user: AuthUser, canViewAll: boolean) {
  return canManageOwnBranchProductRequest(user) && !canViewAll;
}

const REVIEWED_REQUEST_STATUSES = new Set<BranchPurchaseRequestStatus>([
  BranchPurchaseRequestStatus.APPROVED,
  BranchPurchaseRequestStatus.PARTIALLY_APPROVED,
  BranchPurchaseRequestStatus.REJECTED,
  BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE,
  BranchPurchaseRequestStatus.SHIPPED,
  BranchPurchaseRequestStatus.RECEIVED,
  BranchPurchaseRequestStatus.RECEIVED_WITH_DIFFERENCE,
  BranchPurchaseRequestStatus.COMPLETED,
]);

export function resolveBranchDisplayStatus(
  status: BranchPurchaseRequestStatus,
  items: Array<{ quantity: number; approvedQuantity?: number | null; lineStatus?: string | null }>,
) {
  const hasPartial =
    status === BranchPurchaseRequestStatus.APPROVED ||
    status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED
      ? items.some((item) => {
          const approved = item.approvedQuantity ?? item.quantity;
          return approved < item.quantity;
        })
      : false;

  if (status === BranchPurchaseRequestStatus.SUBMITTED || status === BranchPurchaseRequestStatus.SUBMITTED_TO_HQ) {
    return 'SUBMITTED';
  }
  if (status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED || (status === BranchPurchaseRequestStatus.APPROVED && hasPartial)) {
    return 'PARTIALLY_APPROVED';
  }
  if (status === BranchPurchaseRequestStatus.APPROVED) return 'ACCEPTED';
  if (status === BranchPurchaseRequestStatus.REJECTED) return 'REJECTED';
  if (status === BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE || status === BranchPurchaseRequestStatus.SHIPPED) {
    return 'SHIPPED';
  }
  if (status === BranchPurchaseRequestStatus.COMPLETED || status === BranchPurchaseRequestStatus.RECEIVED) {
    return 'COMPLETED';
  }
  if (status === BranchPurchaseRequestStatus.CANCELLED) return 'CANCELLED';
  if (status === BranchPurchaseRequestStatus.DRAFT) return 'DRAFT';
  return status;
}

export function sanitizeBranchPurchaseRequest<T extends {
  status: BranchPurchaseRequestStatus;
  reviewedAt?: Date | string | null;
  items: Array<{
    quantity: number;
    approvedQuantity?: number | null;
    unavailableQuantity?: number | null;
    hqAvailableStock?: number | null;
    currentBranchStock?: number;
    missingQty?: number | null;
    transportExpenseAllocation?: unknown;
    estimatedUnitCost?: unknown;
    totalAmount?: unknown;
    wholesalePriceKgs?: unknown;
    lineStatus?: string | null;
    rejectionReasonCode?: string | null;
    publicComment?: string | null;
    hasPricingPolicyAtReview?: boolean | null;
  }>;
}>(request: T, hideSensitive: boolean) {
  if (!hideSensitive) {
    return {
      ...request,
      branchDisplayStatus: resolveBranchDisplayStatus(request.status, request.items),
      partialFulfillmentMessage: null,
    };
  }

  const branchDisplayStatus = resolveBranchDisplayStatus(request.status, request.items);
  const partialFulfillmentMessage =
    branchDisplayStatus === 'PARTIALLY_APPROVED' ? 'PARTIAL_FULFILLMENT_LATER' : null;
  const reviewed = Boolean(request.reviewedAt) || REVIEWED_REQUEST_STATUSES.has(request.status);

  return {
    ...request,
    branchDisplayStatus,
    partialFulfillmentMessage,
    items: request.items.map((item) => ({
      id: (item as { id?: string }).id,
      productId: (item as { productId?: string }).productId,
      sku: (item as { sku?: string }).sku,
      productName: (item as { productName?: string }).productName,
      quantity: item.quantity,
      approvedQuantity: reviewed ? (item.approvedQuantity ?? 0) : undefined,
      unavailableQuantity: reviewed ? (item.unavailableQuantity ?? Math.max(item.quantity - (item.approvedQuantity ?? 0), 0)) : undefined,
      lineStatus: reviewed ? item.lineStatus : undefined,
      rejectionReasonCode: reviewed ? item.rejectionReasonCode : undefined,
      publicComment: reviewed ? item.publicComment : undefined,
      unit: (item as { unit?: string }).unit,
      note: (item as { note?: string | null }).note,
      branchPurchasePriceKgs: item.wholesalePriceKgs,
      totalAmount: item.totalAmount,
      weightKg: undefined,
      hqAvailableStock: undefined,
      missingQty: reviewed
        ? item.unavailableQuantity ?? Math.max(item.quantity - (item.approvedQuantity ?? 0), 0)
        : undefined,
      currentBranchStock: undefined,
      transportExpenseAllocation: undefined,
      estimatedUnitCost: undefined,
      wholesalePriceKgs: undefined,
      hasPricingPolicyAtReview: undefined,
    })),
  };
}
