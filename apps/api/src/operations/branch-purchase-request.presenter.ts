import { BranchPurchaseRequestStatus } from '@prisma/client';
import { canManageOwnBranchProductRequest } from '../rbac/rbac';
import type { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs, sumApiMoneyKgs } from '../common/authoritative-money.util';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { resolveBranchPurchaseWorkflowLabel } from './branch-purchase-workflow.util';

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
  BranchPurchaseRequestStatus.PAYMENT_CONFIRMED,
  BranchPurchaseRequestStatus.PAYMENT_SUBMITTED,
  BranchPurchaseRequestStatus.PENDING_PAYMENT,
  BranchPurchaseRequestStatus.PENDING_INSTALLMENT_APPROVAL,
]);

export function shouldUseStoredBranchPurchaseCosts(request: {
  status: BranchPurchaseRequestStatus;
  reviewedAt?: Date | string | null;
}) {
  return Boolean(request.reviewedAt) || REVIEWED_REQUEST_STATUSES.has(request.status);
}

export function toBranchPurchaseRequestItemResponse(item: {
  quantity: number;
  approvedQuantity?: number | null;
  estimatedLineProductCostKgs?: unknown;
  estimatedUnitCost?: unknown;
  wholesalePriceKgs?: unknown;
  transportExpenseAllocation?: unknown;
  totalAmount?: unknown;
  approvedLineTotalKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  weightKg?: unknown;
  [key: string]: unknown;
}) {
  const lineQuantity =
    item.approvedQuantity != null && Number(item.approvedQuantity) > 0
      ? Number(item.approvedQuantity)
      : Number(item.quantity ?? 0);
  const estimatedLineProductCostKgs = toApiMoneyKgs(item.estimatedLineProductCostKgs);
  const estimatedUnitCost =
    estimatedLineProductCostKgs > 0 && lineQuantity > 0
      ? deriveDisplayUnitCost(estimatedLineProductCostKgs, lineQuantity)
      : toApiMoneyKgs(item.estimatedUnitCost);

  return {
    ...item,
    wholesalePriceKgs: toApiMoneyKgs(item.wholesalePriceKgs),
    transportExpenseAllocation: toApiMoneyKgs(item.transportExpenseAllocation),
    estimatedUnitCost,
    estimatedLineProductCostKgs,
    totalAmount: toApiMoneyKgs(item.totalAmount),
    approvedLineTotalKgs:
      item.approvedLineTotalKgs != null ? toApiMoneyKgs(item.approvedLineTotalKgs) : null,
    resolvedBranchPriceKgs:
      item.resolvedBranchPriceKgs != null ? toApiMoneyKgs(item.resolvedBranchPriceKgs) : null,
    weightKg: item.weightKg != null ? Number(item.weightKg) : 0,
  };
}

export function sumStoredBranchPurchaseProductCostKgs(
  items: Array<{
    quantity: number;
    approvedQuantity?: number | null;
    estimatedLineProductCostKgs?: unknown;
  }>,
) {
  return sumApiMoneyKgs(
    items.map((item) => {
      const lineQuantity =
        item.approvedQuantity != null && Number(item.approvedQuantity) > 0
          ? Number(item.approvedQuantity)
          : Number(item.quantity ?? 0);
      return lineQuantity > 0 ? item.estimatedLineProductCostKgs : 0;
    }),
  );
}

export function toBranchPurchaseRequestResponse<T extends {
  status: BranchPurchaseRequestStatus;
  reviewedAt?: Date | string | null;
  totalEstimatedAmount?: unknown;
  transportCostKgs?: unknown;
  convertedOrderId?: string | null;
  items: Array<Record<string, unknown>>;
  totalProductCostKgs?: number;
  authoritativeTransferCostKgs?: number;
}>(request: T) {
  const items = request.items.map((item) =>
    toBranchPurchaseRequestItemResponse(item as Parameters<typeof toBranchPurchaseRequestItemResponse>[0]),
  );
  const storedProductCostKgs = sumStoredBranchPurchaseProductCostKgs(items);
  const linkedTransferCostKgs =
    request.authoritativeTransferCostKgs != null
      ? toApiMoneyKgs(request.authoritativeTransferCostKgs)
      : undefined;
  const totalProductCostKgs =
    storedProductCostKgs > 0
      ? storedProductCostKgs
      : linkedTransferCostKgs != null && linkedTransferCostKgs > 0
        ? linkedTransferCostKgs
        : request.totalProductCostKgs != null && Number(request.totalProductCostKgs) > 0
          ? roundDisplayMoney(Number(request.totalProductCostKgs))
          : 0;
  const authoritativeTransferCostKgs =
    storedProductCostKgs > 0 ? storedProductCostKgs : linkedTransferCostKgs;

  return {
    ...request,
    totalEstimatedAmount: toApiMoneyKgs(request.totalEstimatedAmount),
    transportCostKgs: toApiMoneyKgs(request.transportCostKgs),
    totalProductCostKgs,
    authoritativeTransferCostKgs,
    items,
  };
}

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
  const workflowLabel = resolveBranchPurchaseWorkflowLabel(status);
  if (workflowLabel === 'WAITING_FOR_BRANCH_ACCOUNTANT') return 'WAITING_FOR_BRANCH_ACCOUNTANT';
  if (workflowLabel === 'WAITING_FOR_BRANCH_PAYMENT') return 'WAITING_FOR_PAYMENT';
  if (workflowLabel === 'WAITING_FOR_INSTALLMENT_APPROVAL') return 'INSTALLMENT_REQUESTED';
  if (workflowLabel === 'WAITING_FOR_HQ_ACCOUNTANT_CONFIRMATION') return 'PAYMENT_SUBMITTED';
  if (status === BranchPurchaseRequestStatus.BRANCH_CONFIRMED) return 'WAITING_FOR_BRANCH_ACCOUNTANT';
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
    return toBranchPurchaseRequestResponse({
      ...request,
      branchDisplayStatus: resolveBranchDisplayStatus(request.status, request.items),
      partialFulfillmentMessage: null,
    });
  }

  const branchDisplayStatus = resolveBranchDisplayStatus(request.status, request.items);
  const partialFulfillmentMessage =
    branchDisplayStatus === 'HQ_APPROVED' && status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED
      ? 'PARTIAL_FULFILLMENT_LATER'
      : null;
  const reviewed = Boolean(request.reviewedAt) || REVIEWED_REQUEST_STATUSES.has(request.status);

  return toBranchPurchaseRequestResponse({
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
  });
}
