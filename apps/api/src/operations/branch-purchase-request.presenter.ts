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
  BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION,
  BranchPurchaseRequestStatus.BRANCH_CONFIRMED,
  BranchPurchaseRequestStatus.BRANCH_DECLINED,
  BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE,
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
    return 'PENDING_HQ_SALES_REVIEW';
  }
  if (status === BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION) {
    return 'PENDING_BRANCH_CONFIRMATION';
  }
  if (status === BranchPurchaseRequestStatus.BRANCH_CONFIRMED) return 'INVOICE_CREATED';
  if (status === BranchPurchaseRequestStatus.BRANCH_DECLINED) return 'BRANCH_DECLINED';
  if (status === BranchPurchaseRequestStatus.READY_FOR_HQ_WAREHOUSE) return 'READY_FOR_HQ_WAREHOUSE';
  if (status === BranchPurchaseRequestStatus.PENDING_PAYMENT) return 'WAITING_FOR_PAYMENT';
  if (status === BranchPurchaseRequestStatus.PAYMENT_SUBMITTED) return 'PAYMENT_SUBMITTED';
  if (status === BranchPurchaseRequestStatus.PAYMENT_CONFIRMED) return 'PAID';
  if (status === BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL) return 'INSTALLMENT_REQUESTED';
  if (status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED || (status === BranchPurchaseRequestStatus.APPROVED && hasPartial)) {
    return 'HQ_APPROVED';
  }
  if (status === BranchPurchaseRequestStatus.APPROVED) return 'HQ_APPROVED';
  if (status === BranchPurchaseRequestStatus.REJECTED) return 'REJECTED';
  if (status === BranchPurchaseRequestStatus.SENT_TO_HQ_WAREHOUSE) return 'PICKING';
  if (status === BranchPurchaseRequestStatus.SHIPPED) return 'DISPATCHED';
  if (status === BranchPurchaseRequestStatus.RECEIVED || status === BranchPurchaseRequestStatus.RECEIVED_WITH_DIFFERENCE) {
    return 'RECEIVED_BY_BRANCH';
  }
  if (status === BranchPurchaseRequestStatus.COMPLETED) return 'COMPLETED';
  if (status === BranchPurchaseRequestStatus.CANCELLED) return 'CANCELLED';
  if (status === BranchPurchaseRequestStatus.DRAFT) return 'DRAFT';
  return status;
}

/** Branch users may only see Branch Price, Quantity, and Total — never internal pricing layers. */
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
    branchPurchasePriceKgs?: unknown;
    resolvedBranchPriceKgs?: unknown;
    lineStatus?: string | null;
    rejectionReasonCode?: string | null;
    publicComment?: string | null;
    hasPricingPolicyAtReview?: boolean | null;
    pricingPolicyVersionId?: unknown;
    pricingProfileId?: unknown;
    appliedRuleType?: unknown;
    appliedRuleId?: unknown;
    appliedAdjustmentMode?: unknown;
    appliedAdjustmentValue?: unknown;
    baseCostKgs?: unknown;
    baseBranchPriceKgs?: unknown;
    priceResolvedAt?: unknown;
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
    branchDisplayStatus === 'HQ_APPROVED' && status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED
      ? 'PARTIAL_FULFILLMENT_LATER'
      : null;
  const reviewed = Boolean(request.reviewedAt) || REVIEWED_REQUEST_STATUSES.has(request.status);

  return {
    ...request,
    branchDisplayStatus,
    partialFulfillmentMessage,
    items: request.items.map((item) => {
      const branchPrice =
        item.branchPurchasePriceKgs ??
        item.resolvedBranchPriceKgs ??
        item.wholesalePriceKgs ??
        null;
      return {
        id: (item as { id?: string }).id,
        productId: (item as { productId?: string }).productId,
        sku: (item as { sku?: string }).sku,
        productName: (item as { productName?: string }).productName,
        quantity: item.quantity,
        approvedQuantity: reviewed ? (item.approvedQuantity ?? 0) : undefined,
        unavailableQuantity: reviewed
          ? (item.unavailableQuantity ?? Math.max(item.quantity - (item.approvedQuantity ?? 0), 0))
          : undefined,
        lineStatus: reviewed ? item.lineStatus : undefined,
        rejectionReasonCode: reviewed ? item.rejectionReasonCode : undefined,
        publicComment: reviewed ? item.publicComment : undefined,
        unit: (item as { unit?: string }).unit,
        note: (item as { note?: string | null }).note,
        branchPurchasePriceKgs: branchPrice,
        totalAmount: item.totalAmount,
        // Explicitly omit internal pricing layers for branch users
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
        hasPricingPolicyAtSubmit: undefined,
        pricingPolicyVersionId: undefined,
        pricingProfileId: undefined,
        appliedRuleType: undefined,
        appliedRuleId: undefined,
        appliedAdjustmentMode: undefined,
        appliedAdjustmentValue: undefined,
        baseCostKgs: undefined,
        baseBranchPriceKgs: undefined,
        priceResolvedAt: undefined,
        resolvedBranchPriceKgs: undefined,
      };
    }),
  };
}
