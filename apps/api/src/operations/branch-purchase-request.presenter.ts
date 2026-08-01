import { BranchPurchaseRequestStatus } from '@prisma/client';
import { canManageOwnBranchProductRequest } from '../rbac/rbac';
import type { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs, sumApiMoneyKgs } from '../common/authoritative-money.util';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  resolveBranchPurchaseEstimatedAmountKgs,
  resolveBranchPurchaseLinePayableAmount,
  shouldTransferBranchPurchaseAtCost,
} from './branch-purchase-estimated-amount.util';
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
  branch?: { branchType?: string | null } | null;
  branchType?: string | null;
}>(request: T) {
  const branchType = request.branch?.branchType ?? request.branchType ?? null;
  const transferAtCost = shouldTransferBranchPurchaseAtCost(branchType);
  const items = request.items.map((rawItem) => {
    const item = toBranchPurchaseRequestItemResponse(
      rawItem as Parameters<typeof toBranchPurchaseRequestItemResponse>[0],
    );
    if (!transferAtCost) return item;
    const lineQuantity =
      item.approvedQuantity != null && Number(item.approvedQuantity) > 0
        ? Number(item.approvedQuantity)
        : Number(item.quantity ?? 0);
    const payable = resolveBranchPurchaseLinePayableAmount({
      branchType,
      quantity: lineQuantity,
      estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
      unitPriceKgs: item.resolvedBranchPriceKgs ?? item.wholesalePriceKgs,
      hasPricingPolicy: true,
    });
    if (payable <= 0) return item;
    return {
      ...item,
      totalAmount: payable,
      approvedLineTotalKgs:
        item.approvedQuantity != null && Number(item.approvedQuantity) > 0 ? payable : item.approvedLineTotalKgs,
    };
  });
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
  const totalEstimatedAmount = resolveBranchPurchaseEstimatedAmountKgs({
    branchType,
    totalProductCostKgs,
    lineProductCosts: items.map((item) => Number(item.estimatedLineProductCostKgs ?? 0)),
    storedEstimatedAmountKgs: toApiMoneyKgs(request.totalEstimatedAmount),
  });

  return {
    ...request,
    totalEstimatedAmount,
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
/** Remove product cost fields while keeping branch/selling prices and order totals. */
export function stripBranchPurchaseRequestCostFields<T extends Record<string, unknown>>(request: T): T {
  const items = Array.isArray(request.items)
    ? request.items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const next = { ...(item as Record<string, unknown>) };
        delete next.estimatedUnitCost;
        delete next.estimatedLineProductCostKgs;
        delete next.transportExpenseAllocation;
        delete next.baseCostKgs;
        return next;
      })
    : request.items;

  const next: Record<string, unknown> = { ...request, items };
  delete next.totalProductCostKgs;
  delete next.authoritativeTransferCostKgs;
  delete next.transportCostKgs;
  return next as T;
}

export function presentBranchPurchaseRequestForUser<T extends {
  status: BranchPurchaseRequestStatus;
  reviewedAt?: Date | string | null;
  items: Array<{
    id?: string;
    productId?: string;
    sku?: string;
    productName?: string;
    unit?: string;
    note?: string | null;
    quantity: number;
    approvedQuantity?: number | null;
    unavailableQuantity?: number | null;
    hqAvailableStock?: number | null;
    currentBranchStock?: number;
    missingQty?: number | null;
    transportExpenseAllocation?: unknown;
    estimatedUnitCost?: unknown;
    estimatedLineProductCostKgs?: unknown;
    totalAmount?: unknown;
    approvedLineTotalKgs?: unknown;
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
    [key: string]: unknown;
  }>;
  branch?: { branchType?: string | null } | null;
  branchType?: string | null;
  totalEstimatedAmount?: unknown;
  totalProductCostKgs?: number;
  [key: string]: unknown;
}>(
  request: T,
  options: { hideSensitive: boolean; hideFinancialCost: boolean },
) {
  const full = sanitizeBranchPurchaseRequest(request, options.hideSensitive);
  if (!options.hideSensitive && options.hideFinancialCost) {
    return stripBranchPurchaseRequestCostFields(full);
  }
  return full;
}

export function sanitizeBranchPurchaseRequest<T extends {
  status: BranchPurchaseRequestStatus;
  reviewedAt?: Date | string | null;
  items: Array<{
    id?: string;
    productId?: string;
    sku?: string;
    productName?: string;
    unit?: string;
    note?: string | null;
    quantity: number;
    approvedQuantity?: number | null;
    unavailableQuantity?: number | null;
    hqAvailableStock?: number | null;
    currentBranchStock?: number;
    missingQty?: number | null;
    transportExpenseAllocation?: unknown;
    estimatedUnitCost?: unknown;
    estimatedLineProductCostKgs?: unknown;
    totalAmount?: unknown;
    approvedLineTotalKgs?: unknown;
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
  branch?: { branchType?: string | null } | null;
  branchType?: string | null;
  totalEstimatedAmount?: unknown;
  totalProductCostKgs?: number;
}>(request: T, hideSensitive: boolean) {
  // Authoritative totals must be computed from full FIFO line data before stripping.
  const full = toBranchPurchaseRequestResponse({
    ...request,
    branchDisplayStatus: resolveBranchDisplayStatus(request.status, request.items),
    partialFulfillmentMessage: null,
  });

  if (!hideSensitive) {
    return full;
  }

  const branchDisplayStatus = resolveBranchDisplayStatus(request.status, request.items);
  const partialFulfillmentMessage =
    branchDisplayStatus === 'HQ_APPROVED' && request.status === BranchPurchaseRequestStatus.PARTIALLY_APPROVED
      ? 'PARTIAL_FULFILLMENT_LATER'
      : null;
  const reviewed = Boolean(request.reviewedAt) || REVIEWED_REQUEST_STATUSES.has(request.status);
  const fullItemsById = new Map(
    full.items
      .filter((item) => (item as { id?: string }).id)
      .map((item) => [(item as { id: string }).id, item]),
  );

  return {
    ...full,
    branchDisplayStatus,
    partialFulfillmentMessage,
    // Keep authoritative header totals for Branch Sales "Сумма".
    totalEstimatedAmount: full.totalEstimatedAmount,
    totalProductCostKgs: undefined,
    authoritativeTransferCostKgs: undefined,
    items: request.items.map((item) => {
      const fullItem = item.id ? fullItemsById.get(item.id) : undefined;
      const branchPrice =
        item.branchPurchasePriceKgs ??
        item.resolvedBranchPriceKgs ??
        item.wholesalePriceKgs ??
        null;
      return {
        id: item.id,
        productId: item.productId,
        sku: item.sku,
        productName: item.productName,
        quantity: item.quantity,
        approvedQuantity: reviewed ? (item.approvedQuantity ?? 0) : undefined,
        unavailableQuantity: reviewed
          ? (item.unavailableQuantity ?? Math.max(item.quantity - (item.approvedQuantity ?? 0), 0))
          : undefined,
        lineStatus: reviewed ? item.lineStatus : undefined,
        rejectionReasonCode: reviewed ? item.rejectionReasonCode : undefined,
        publicComment: reviewed ? item.publicComment : undefined,
        unit: item.unit,
        note: item.note,
        branchPurchasePriceKgs: branchPrice,
        // Prefer authoritative payable total from full FIFO-based response.
        totalAmount: fullItem?.totalAmount ?? item.totalAmount,
        approvedLineTotalKgs: reviewed
          ? (fullItem?.approvedLineTotalKgs ??
            (item.approvedQuantity != null && Number(item.approvedQuantity) > 0
              ? fullItem?.totalAmount
              : undefined))
          : undefined,
        weightKg: undefined,
        hqAvailableStock: undefined,
        missingQty: reviewed
          ? item.unavailableQuantity ?? Math.max(item.quantity - (item.approvedQuantity ?? 0), 0)
          : undefined,
        currentBranchStock: undefined,
        transportExpenseAllocation: undefined,
        estimatedUnitCost: undefined,
        estimatedLineProductCostKgs: undefined,
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
