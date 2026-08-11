import { BranchPurchaseRequestStatus } from '@prisma/client';
import { canManageOwnBranchProductRequest } from '../rbac/rbac';
import type { AuthUser } from '../auth/auth.types';
import { toApiMoneyKgs, sumApiMoneyKgs } from '../common/authoritative-money.util';
import { deriveDisplayUnitCost, roundDisplayMoney } from '../pricing/product-cost-precision.util';
import {
  shouldTransferBranchPurchaseAtCost,
} from './branch-purchase-estimated-amount.util';
import {
  resolveBranchPurchaseBranchLineTotalKgs,
  resolveBranchPurchaseBranchUnitPriceKgs,
  resolveBranchPurchaseCommercialLineTotalKgs,
  resolveBranchPurchaseDraftLineTotalKgs,
  sumBranchPurchaseBranchLineTotalsKgs,
  sumBranchPurchaseCommercialLineTotalsKgs,
  sumBranchPurchaseDraftLineTotalsKgs,
} from './branch-purchase-branch-display.util';
import { resolveBranchPurchaseWorkflowLabel } from './branch-purchase-workflow.util';
import { computeBranchPurchaseHqReviewLineAmountKgs } from './branch-purchase-review-totals.util';
import { sortBranchPurchaseRequestItems } from './branch-purchase-request-items-order.util';

export function canSeeHqStockInBranchRequests(user: AuthUser, canViewAll: boolean) {
  return canViewAll;
}

export function isBranchOnlyRequestUser(user: AuthUser, canViewAll: boolean) {
  return canManageOwnBranchProductRequest(user) && !canViewAll;
}

export function isPendingHqSalesReviewStatus(status: BranchPurchaseRequestStatus): boolean {
  return (
    status === BranchPurchaseRequestStatus.SUBMITTED ||
    status === BranchPurchaseRequestStatus.SUBMITTED_TO_HQ
  );
}

export function isDraftBranchPurchaseRequestStatus(status: BranchPurchaseRequestStatus): boolean {
  return status === BranchPurchaseRequestStatus.DRAFT;
}

function resolveDraftLinePricingContext(
  item: Record<string, unknown>,
  branchType: string | null,
) {
  return {
    quantity: Number(item.quantity ?? 0),
    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    wholesalePriceKgs: item.wholesalePriceKgs,
    totalAmount: item.totalAmount,
    estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
    branchType,
    hasPricingPolicy:
      (item.hasPricingPolicyAtReview as boolean | null | undefined) ??
      (item.hasPricingPolicyAtSubmit as boolean | null | undefined),
  };
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
  const orderedItems = sortBranchPurchaseRequestItems(request.items);
  const isDraft = isDraftBranchPurchaseRequestStatus(request.status);
  const items = orderedItems.map((rawItem) => {
    const item = toBranchPurchaseRequestItemResponse(
      rawItem as Parameters<typeof toBranchPurchaseRequestItemResponse>[0],
    );
    const lineAmount = computeBranchPurchaseHqReviewLineAmountKgs({
      quantity: Number(item.quantity ?? 0),
      approvedQuantity: item.approvedQuantity as number | null | undefined,
      lineStatus: (item as { lineStatus?: string | null }).lineStatus,
      resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
      branchPurchasePriceKgs: (item as { branchPurchasePriceKgs?: unknown }).branchPurchasePriceKgs,
      wholesalePriceKgs: item.wholesalePriceKgs,
      totalAmount: item.totalAmount,
      approvedLineTotalKgs: item.approvedLineTotalKgs,
      estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
      hasPricingPolicyAtReview:
        (item as { hasPricingPolicyAtReview?: boolean | null }).hasPricingPolicyAtReview ??
        (item as { hasPricingPolicyAtSubmit?: boolean | null }).hasPricingPolicyAtSubmit,
      branchType,
    });
    const storedTotal = roundDisplayMoney(Number(item.totalAmount ?? 0));
    const resolvedTotal = isDraft
      ? resolveBranchPurchaseDraftLineTotalKgs(
          resolveDraftLinePricingContext(
            {
              ...item,
              branchPurchasePriceKgs: (item as { branchPurchasePriceKgs?: unknown }).branchPurchasePriceKgs,
              hasPricingPolicyAtSubmit: (item as { hasPricingPolicyAtSubmit?: boolean | null })
                .hasPricingPolicyAtSubmit,
              hasPricingPolicyAtReview: (item as { hasPricingPolicyAtReview?: boolean | null })
                .hasPricingPolicyAtReview,
            },
            branchType,
          ),
        )
      : lineAmount > 0
        ? lineAmount
        : storedTotal;
    const approvedQty = Math.max(Number(item.approvedQuantity ?? 0), 0);
    return {
      ...item,
      totalAmount: resolvedTotal,
      approvedLineTotalKgs:
        approvedQty > 0
          ? resolvedTotal > 0
            ? resolvedTotal
            : item.approvedLineTotalKgs
          : item.approvedLineTotalKgs,
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
  // approvedOrderTotal = SUM(authoritative line totals) — consumed by all downstream roles.
  const computedOrderTotal = sumApiMoneyKgs(items.map((item) => Number(item.totalAmount ?? 0)));
  const totalEstimatedAmount = isDraft
    ? sumBranchPurchaseDraftLineTotalsKgs(
        items.map((item) =>
          resolveDraftLinePricingContext(item as Record<string, unknown>, branchType),
        ),
      )
    : computedOrderTotal > 0
      ? computedOrderTotal
      : toApiMoneyKgs(request.totalEstimatedAmount);

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
    hasPricingPolicyAtSubmit?: boolean | null;
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
    hasPricingPolicyAtSubmit?: boolean | null;
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
  // Authoritative commercial totals must be computed from full line snapshots before stripping.
  const full = toBranchPurchaseRequestResponse({
    ...request,
    items: sortBranchPurchaseRequestItems(request.items),
    branchDisplayStatus: resolveBranchDisplayStatus(request.status, request.items),
    partialFulfillmentMessage: null,
  });
  const isDraft = isDraftBranchPurchaseRequestStatus(request.status);

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

  const transferAtCost = shouldTransferBranchPurchaseAtCost(
    request.branch?.branchType ?? request.branchType ?? null,
  );
  const pendingHqSalesReview = isPendingHqSalesReviewStatus(request.status);
  const branchType = request.branch?.branchType ?? request.branchType ?? null;

  // HQ_BRANCH: strip internal cost fields for branch users, but keep the same commercial
  // BPR snapshot (qty × saved Цена для филиала) used by HQ Sales / Accountant / CEO / Cashier.
  // Inventory FIFO remains on estimatedLineProductCostKgs and must not replace Сумма.
  if (transferAtCost) {
    const sanitizedItems = request.items.map((item) => {
        const fullItem = item.id ? fullItemsById.get(item.id) : undefined;
        const branchUnitPrice = resolveBranchPurchaseBranchUnitPriceKgs({
          branchPurchasePriceKgs: fullItem?.resolvedBranchPriceKgs ?? item.resolvedBranchPriceKgs,
          resolvedBranchPriceKgs: fullItem?.resolvedBranchPriceKgs ?? item.resolvedBranchPriceKgs,
          wholesalePriceKgs: item.wholesalePriceKgs,
        });
        const commercialLineTotal = roundDisplayMoney(
          Number(fullItem?.totalAmount ?? item.totalAmount ?? 0),
        );
        const draftLineContext = resolveDraftLinePricingContext(
          {
            quantity: item.quantity,
            branchPurchasePriceKgs: branchUnitPrice,
            resolvedBranchPriceKgs: branchUnitPrice,
            wholesalePriceKgs: item.wholesalePriceKgs,
            totalAmount: item.totalAmount,
            estimatedLineProductCostKgs:
              fullItem?.estimatedLineProductCostKgs ?? item.estimatedLineProductCostKgs,
            hasPricingPolicyAtSubmit: item.hasPricingPolicyAtSubmit,
            hasPricingPolicyAtReview: item.hasPricingPolicyAtReview,
          },
          branchType,
        );
        const lineTotal = isDraft
          ? resolveBranchPurchaseDraftLineTotalKgs(draftLineContext)
          : pendingHqSalesReview && !reviewed
            ? commercialLineTotal > 0
              ? commercialLineTotal
              : resolveBranchPurchaseBranchLineTotalKgs({
                  quantity: item.quantity,
                  branchPurchasePriceKgs: branchUnitPrice,
                  resolvedBranchPriceKgs: branchUnitPrice,
                  totalAmount: 0,
                  transferAtCost: false,
                })
            : commercialLineTotal;
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
          branchPurchasePriceKgs: branchUnitPrice,
          totalAmount: lineTotal,
          approvedLineTotalKgs: reviewed
            ? (fullItem?.approvedLineTotalKgs ??
              (item.approvedQuantity != null && Number(item.approvedQuantity) > 0
                ? lineTotal
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
      });

    const branchOrderTotal = isDraft
      ? sumBranchPurchaseDraftLineTotalsKgs(
          sanitizedItems.map((item) =>
            resolveDraftLinePricingContext(
              {
                quantity: item.quantity,
                branchPurchasePriceKgs: item.branchPurchasePriceKgs,
                resolvedBranchPriceKgs: item.branchPurchasePriceKgs,
                totalAmount: item.totalAmount,
                estimatedLineProductCostKgs: fullItemsById.get(item.id ?? '')?.estimatedLineProductCostKgs,
                hasPricingPolicyAtSubmit: (
                  fullItemsById.get(item.id ?? '') as { hasPricingPolicyAtSubmit?: boolean | null } | undefined
                )?.hasPricingPolicyAtSubmit,
                hasPricingPolicyAtReview: fullItemsById.get(item.id ?? '')?.hasPricingPolicyAtReview,
              },
              request.branch?.branchType ?? request.branchType ?? null,
            ),
          ),
        )
      : pendingHqSalesReview && !reviewed
        ? roundDisplayMoney(
            Number(full.totalEstimatedAmount ?? 0) > 0
              ? Number(full.totalEstimatedAmount)
              : sumBranchPurchaseBranchLineTotalsKgs(
                  sanitizedItems.map((item) => ({
                    quantity: item.quantity,
                    branchPurchasePriceKgs: item.branchPurchasePriceKgs,
                    totalAmount: item.totalAmount,
                  })),
                ),
          )
        : full.totalEstimatedAmount;

    return {
      ...full,
      branchDisplayStatus,
      partialFulfillmentMessage,
      totalEstimatedAmount: branchOrderTotal,
      totalProductCostKgs: undefined,
      authoritativeTransferCostKgs: undefined,
      items: sanitizedItems,
    };
  }

  // Franchise/Dealer: commercial qty × branch price before review; reviewed totals from `full`.
  const branchItems = request.items.map((item) => {
    const fullItem = item.id ? fullItemsById.get(item.id) : undefined;
    const branchUnitPrice = resolveBranchPurchaseBranchUnitPriceKgs({
      branchPurchasePriceKgs: fullItem?.resolvedBranchPriceKgs ?? item.resolvedBranchPriceKgs,
      resolvedBranchPriceKgs: fullItem?.resolvedBranchPriceKgs ?? item.resolvedBranchPriceKgs,
      wholesalePriceKgs: item.wholesalePriceKgs,
    });
    const lineTotal = isDraft
      ? resolveBranchPurchaseDraftLineTotalKgs(
          resolveDraftLinePricingContext(
            {
              quantity: item.quantity,
              branchPurchasePriceKgs: branchUnitPrice,
              resolvedBranchPriceKgs: branchUnitPrice,
              wholesalePriceKgs: item.wholesalePriceKgs,
              totalAmount: item.totalAmount,
              estimatedLineProductCostKgs:
                fullItem?.estimatedLineProductCostKgs ?? item.estimatedLineProductCostKgs,
              hasPricingPolicyAtSubmit: item.hasPricingPolicyAtSubmit,
              hasPricingPolicyAtReview: item.hasPricingPolicyAtReview,
            },
            branchType,
          ),
        )
      : pendingHqSalesReview || !reviewed
        ? resolveBranchPurchaseCommercialLineTotalKgs({
            quantity: item.quantity,
            branchPurchasePriceKgs: branchUnitPrice,
            resolvedBranchPriceKgs: branchUnitPrice,
          })
        : roundDisplayMoney(Number(fullItem?.totalAmount ?? item.totalAmount ?? 0));
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
      branchPurchasePriceKgs: branchUnitPrice,
      totalAmount: lineTotal,
      approvedLineTotalKgs: reviewed
        ? (fullItem?.approvedLineTotalKgs ??
          (item.approvedQuantity != null && Number(item.approvedQuantity) > 0
            ? lineTotal
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
  });

  const branchOrderTotal = isDraft
    ? sumBranchPurchaseDraftLineTotalsKgs(
        branchItems.map((item) =>
          resolveDraftLinePricingContext(
            {
              quantity: item.quantity,
              branchPurchasePriceKgs: item.branchPurchasePriceKgs,
              resolvedBranchPriceKgs: item.branchPurchasePriceKgs,
              totalAmount: item.totalAmount,
              estimatedLineProductCostKgs: fullItemsById.get(item.id ?? '')?.estimatedLineProductCostKgs,
              hasPricingPolicyAtSubmit: (
                fullItemsById.get(item.id ?? '') as { hasPricingPolicyAtSubmit?: boolean | null } | undefined
              )?.hasPricingPolicyAtSubmit,
              hasPricingPolicyAtReview: fullItemsById.get(item.id ?? '')?.hasPricingPolicyAtReview,
            },
            branchType,
          ),
        ),
      )
    : pendingHqSalesReview || !reviewed
      ? sumBranchPurchaseCommercialLineTotalsKgs(
          branchItems.map((item) => ({
            quantity: item.quantity,
            branchPurchasePriceKgs: item.branchPurchasePriceKgs,
          })),
        )
      : roundDisplayMoney(
          branchItems.reduce((sum, item) => sum + Number((item as { totalAmount?: number }).totalAmount ?? 0), 0),
        );

  return {
    ...full,
    branchDisplayStatus,
    partialFulfillmentMessage,
    totalEstimatedAmount: branchOrderTotal > 0 ? branchOrderTotal : full.totalEstimatedAmount,
    totalProductCostKgs: undefined,
    authoritativeTransferCostKgs: undefined,
    items: branchItems,
  };
}
