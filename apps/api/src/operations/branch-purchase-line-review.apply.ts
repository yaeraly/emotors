import {
  BranchPurchaseRequestLineStatus,
  BranchPurchaseRequestStatus,
  BranchRequestLineRejectionReason,
  BranchRequestShortageStatus,
  BranchType,
  HqStockBookingReleaseReason,
  Prisma,
} from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { addBookingHours, BRANCH_CONFIRMATION_BOOKING_HOURS } from '../inventory/hq-stock-booking.constants';
import type { HqStockBookingService } from '../inventory/hq-stock-booking.service';
import { resolveBranchPurchaseFifoLineCost } from './branch-purchase-fifo-cost.util';
import {
  branchPurchaseRequestItemsInclude,
  branchPurchaseRequestItemsOrderBy,
} from './branch-purchase-request-items-order.util';
import {
  computeBranchPurchaseHqReviewLineAmountKgs,
  sumBranchPurchaseHqReviewLineAmountsKgs,
} from './branch-purchase-review-totals.util';
import {
  deriveRequestStatusFromLines,
  resolveLineReview,
  type LineReviewInput,
  type ResolvedLineReview,
} from './branch-request-review.util';

type PrismaTx = Prisma.TransactionClient;

export type BranchPurchaseLineReviewContext = {
  requestId: string;
  branchId: string;
  assignedHqWarehouseId: string;
  stockMap: Map<string, number>;
  bookedMap: Map<string, number>;
  physicalStockMap: Map<string, number>;
  bookingIdByLine: Map<string, string>;
  pricingAvailability: Map<string, boolean>;
  branchConfirmationExpiresAt: Date;
};

export type BranchPurchaseRequestItemRow = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  bookedQuantity: number | null;
  hqPhysicalStock: number | null;
  estimatedUnitCost: Prisma.Decimal | number | null;
  resolvedBranchPriceKgs: Prisma.Decimal | number | null;
  totalAmount?: Prisma.Decimal | number | null;
  approvedLineTotalKgs?: Prisma.Decimal | number | null;
};

export type AppliedBranchPurchaseLineReview = {
  itemId: string;
  lineStatus: BranchPurchaseRequestLineStatus;
  approvedQuantity: number;
  unavailableQuantity: number;
  rejectionReasonCode: BranchRequestLineRejectionReason | null;
  publicComment: string | null;
  notifyCeoNoPricingPolicy: boolean;
  notifyCeoOutOfStock: boolean;
  generalAvailable: number;
  bookedQuantity: number;
  unchanged?: boolean;
};

type ApplyLineReviewDeps = {
  hqStockBookingService: HqStockBookingService;
  pricingFifoService: {
    syncFifoBatchesFromHqStockMovements: (tx?: PrismaTx) => Promise<unknown>;
  };
  auditInTx: (
    tx: PrismaTx,
    user: AuthUser,
    branchId: string | null,
    action: string,
    entity: string,
    entityId: string,
    extra?: Record<string, unknown>,
  ) => Promise<unknown>;
};

export function mapBranchPurchaseLineReviewAuditAction(lineStatus: BranchPurchaseRequestLineStatus) {
  switch (lineStatus) {
    case BranchPurchaseRequestLineStatus.APPROVED:
      return 'BRANCH_ORDER_ITEM_APPROVED';
    case BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED:
      return 'BRANCH_ORDER_ITEM_PARTIALLY_APPROVED';
    case BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES:
      return 'BRANCH_ORDER_ITEM_REJECTED';
    case BranchPurchaseRequestLineStatus.REJECTED:
      return 'BRANCH_ORDER_ITEM_REJECTED';
    default:
      return 'BRANCH_ORDER_ITEM_REVIEWED';
  }
}

export function resolveBranchPurchaseLineReviewAuditAction(params: {
  previousLineStatus?: BranchPurchaseRequestLineStatus | null;
  previousApprovedQuantity?: number | null;
  nextLineStatus: BranchPurchaseRequestLineStatus;
  nextApprovedQuantity: number;
}) {
  const previousStatus = params.previousLineStatus ?? BranchPurchaseRequestLineStatus.PENDING_REVIEW;
  const previousQty = Math.max(Number(params.previousApprovedQuantity ?? 0), 0);
  const nextQty = Math.max(Number(params.nextApprovedQuantity ?? 0), 0);
  const nextStatus = params.nextLineStatus;
  const wasReviewed = previousStatus !== BranchPurchaseRequestLineStatus.PENDING_REVIEW;
  const nextRejected =
    nextStatus === BranchPurchaseRequestLineStatus.REJECTED ||
    nextStatus === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES;
  const previousRejected =
    previousStatus === BranchPurchaseRequestLineStatus.REJECTED ||
    previousStatus === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES;

  if (!wasReviewed) {
    return mapBranchPurchaseLineReviewAuditAction(nextStatus);
  }

  if (previousRejected && nextQty > 0) {
    return 'BRANCH_ORDER_ITEM_REAPPROVED';
  }

  if (
    previousQty === nextQty &&
    previousStatus === nextStatus &&
    (previousRejected === nextRejected || (!previousRejected && !nextRejected))
  ) {
    return mapBranchPurchaseLineReviewAuditAction(nextStatus);
  }

  if (nextRejected && previousQty > 0) {
    return 'BRANCH_ORDER_ITEM_REJECTED';
  }

  if (previousQty !== nextQty || previousStatus !== nextStatus) {
    return 'BRANCH_ORDER_ITEM_APPROVAL_CHANGED';
  }

  return mapBranchPurchaseLineReviewAuditAction(nextStatus);
}

export function branchPurchaseLineReviewDecisionUnchanged(
  item: {
    lineStatus: BranchPurchaseRequestLineStatus;
    approvedQuantity: number | null;
    unavailableQuantity: number | null;
    rejectionReasonCode: BranchRequestLineRejectionReason | null;
    publicComment: string | null;
  },
  resolved: ResolvedLineReview,
) {
  return (
    item.lineStatus === resolved.lineStatus &&
    Math.max(item.approvedQuantity ?? 0, 0) === resolved.approvedQuantity &&
    Math.max(item.unavailableQuantity ?? 0, 0) === resolved.unavailableQuantity &&
    (item.rejectionReasonCode ?? null) === (resolved.rejectionReasonCode ?? null) &&
    (item.publicComment?.trim() || null) === (resolved.publicComment?.trim() || null)
  );
}

export async function recalculateBranchPurchaseRequestReviewTotalsInTx(
  tx: PrismaTx,
  requestId: string,
  branchId: string,
) {
  const reviewBranch = await tx.branch.findFirst({
    where: { id: branchId, deletedAt: null },
    select: { branchType: true },
  });
  const branchType = reviewBranch?.branchType ?? null;

  const refreshedItems = await tx.branchPurchaseRequestItem.findMany({
    where: { requestId },
    orderBy: branchPurchaseRequestItemsOrderBy,
    select: {
      id: true,
      approvedQuantity: true,
      quantity: true,
      lineStatus: true,
      totalAmount: true,
      approvedLineTotalKgs: true,
      estimatedLineProductCostKgs: true,
      resolvedBranchPriceKgs: true,
      hasPricingPolicyAtReview: true,
      hasPricingPolicyAtSubmit: true,
    },
  });

  const lineInputs = refreshedItems.map((row) => ({
    id: row.id,
    quantity: row.quantity,
    approvedQuantity: row.approvedQuantity,
    lineStatus: row.lineStatus,
    totalAmount: row.totalAmount,
    approvedLineTotalKgs: row.approvedLineTotalKgs,
    resolvedBranchPriceKgs: row.resolvedBranchPriceKgs,
    estimatedLineProductCostKgs: row.estimatedLineProductCostKgs,
    hasPricingPolicyAtReview: row.hasPricingPolicyAtReview ?? row.hasPricingPolicyAtSubmit,
    branchType,
  }));

  for (const row of lineInputs) {
    const lineAmount = computeBranchPurchaseHqReviewLineAmountKgs(row);
    const reviewed =
      row.lineStatus !== BranchPurchaseRequestLineStatus.PENDING_REVIEW && row.lineStatus != null;
    await tx.branchPurchaseRequestItem.update({
      where: { id: row.id },
      data: {
        // Authoritative approved line total = effectiveQty × saved submit unit price snapshot.
        totalAmount: lineAmount,
        approvedLineTotalKgs: reviewed && lineAmount > 0 ? lineAmount : null,
      },
    });
  }

  // approvedOrderTotal = SUM(authoritative approved line totals) — single source for all roles.
  const orderTotalKgs = sumBranchPurchaseHqReviewLineAmountsKgs(lineInputs);

  await tx.branchPurchaseRequest.update({
    where: { id: requestId },
    data: {
      totalEstimatedAmount: orderTotalKgs,
    },
  });

  return orderTotalKgs;
}

export async function applyBranchPurchaseLineReviewInTx(
  tx: PrismaTx,
  user: AuthUser,
  deps: ApplyLineReviewDeps,
  item: BranchPurchaseRequestItemRow & {
    lineStatus: BranchPurchaseRequestLineStatus;
    approvedQuantity: number | null;
    unavailableQuantity: number | null;
    rejectionReasonCode: BranchRequestLineRejectionReason | null;
    publicComment: string | null;
  },
  input: LineReviewInput,
  context: BranchPurchaseLineReviewContext,
  reviewBranch: { branchType: BranchType | null; hqToBranchMarkupPercent: Prisma.Decimal | number | null } | null,
): Promise<AppliedBranchPurchaseLineReview & { unchanged?: boolean }> {
  const generalAvailable = context.stockMap.get(item.productId) ?? 0;
  const bookedQuantity = context.bookedMap.get(item.id) ?? item.bookedQuantity ?? 0;
  const hasPricingPolicy = context.pricingAvailability.get(item.id) ?? false;

  let resolved;
  try {
    resolved = resolveLineReview(input, {
      requestedQuantity: item.quantity,
      availableQuantity: generalAvailable,
      bookedQuantity,
      hasPricingPolicy,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'APPROVED_QUANTITY_EXCEEDS_AVAILABLE') {
      throw new Error(`APPROVED_QUANTITY_EXCEEDS_AVAILABLE:${item.sku}`);
    }
    throw error;
  }

  if (
    (resolved.lineStatus === BranchPurchaseRequestLineStatus.REJECTED ||
      resolved.lineStatus === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES) &&
    !resolved.publicComment?.trim()
  ) {
    throw new Error(`PUBLIC_COMMENT_REQUIRED:${item.sku}`);
  }

  if (branchPurchaseLineReviewDecisionUnchanged(item, resolved)) {
    return {
      itemId: item.id,
      ...resolved,
      generalAvailable,
      bookedQuantity,
      unchanged: true,
    };
  }

  let estimatedLineProductCostKgs = 0;
  let estimatedUnitCost = 0;
  if (resolved.approvedQuantity > 0) {
    const fifoCost = await resolveBranchPurchaseFifoLineCost(deps.pricingFifoService as never, tx, {
      productId: item.productId,
      warehouseId: context.assignedHqWarehouseId,
      quantity: resolved.approvedQuantity,
      branchType: reviewBranch?.branchType,
      hqToBranchMarkupPercent: Number(reviewBranch?.hqToBranchMarkupPercent ?? 0),
      fallbackUnitCost: Number(item.estimatedUnitCost ?? 0),
      fallbackUnitPrice: Number(item.resolvedBranchPriceKgs ?? 0),
    });
    estimatedLineProductCostKgs = fifoCost.estimatedLineProductCostKgs;
    estimatedUnitCost = fifoCost.estimatedUnitCost;
  }

  // Persist authoritative commercial Сумма at decision time:
  // approvedQty × saved Цена для филиала. FIFO stays on estimatedLineProductCostKgs only.
  const authoritativeLineAmount = computeBranchPurchaseHqReviewLineAmountKgs({
    quantity: item.quantity,
    approvedQuantity: resolved.approvedQuantity,
    lineStatus: resolved.lineStatus,
    resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
    wholesalePriceKgs: (item as { wholesalePriceKgs?: unknown }).wholesalePriceKgs,
    totalAmount: item.totalAmount,
    approvedLineTotalKgs: item.approvedLineTotalKgs,
    estimatedLineProductCostKgs,
    hasPricingPolicyAtReview: hasPricingPolicy,
    branchType: reviewBranch?.branchType,
  });

  await tx.branchPurchaseRequestItem.update({
    where: { id: item.id },
    data: {
      approvedQuantity: resolved.approvedQuantity,
      unavailableQuantity: resolved.unavailableQuantity,
      hqAvailableStock: deps.hqStockBookingService.availableForRequestLine(generalAvailable, bookedQuantity),
      hqPhysicalStock: context.physicalStockMap.get(item.productId) ?? item.hqPhysicalStock ?? 0,
      lineStatus: resolved.lineStatus,
      rejectionReasonCode: resolved.rejectionReasonCode,
      publicComment: resolved.publicComment,
      hasPricingPolicyAtReview: hasPricingPolicy,
      approvedLineTotalKgs: authoritativeLineAmount > 0 ? authoritativeLineAmount : null,
      totalAmount: authoritativeLineAmount,
      bookingExpiresAt: resolved.approvedQuantity > 0 ? context.branchConfirmationExpiresAt : null,
      bookedQuantity: resolved.approvedQuantity > 0 ? resolved.approvedQuantity : 0,
      estimatedLineProductCostKgs,
      estimatedUnitCost,
    },
  });

  const bookingId = context.bookingIdByLine.get(item.id) ?? null;
  if (resolved.approvedQuantity > 0) {
    let effectiveBookingId = bookingId;
    if (!effectiveBookingId) {
      const created = await deps.hqStockBookingService.createBookingForLineReviewInTx(tx, user, {
        requestId: context.requestId,
        branchId: context.branchId,
        warehouseId: context.assignedHqWarehouseId,
        requestLineId: item.id,
        productId: item.productId,
        sku: item.sku,
        requestedQuantity: resolved.approvedQuantity,
        expiresAt: context.branchConfirmationExpiresAt,
      });
      effectiveBookingId = created.bookingId;
    }

    if (effectiveBookingId) {
      await deps.hqStockBookingService.confirmBookingInTx(
        tx,
        user,
        effectiveBookingId,
        resolved.approvedQuantity,
        context.branchConfirmationExpiresAt,
      );
      await deps.auditInTx(tx, user, context.branchId, 'HQ_STOCK_BOOKING_CONFIRMED', 'HqStockBooking', effectiveBookingId, {
        requestId: context.requestId,
        requestLineId: item.id,
        approvedQuantity: resolved.approvedQuantity,
      });
    }
  } else if (bookingId) {
    const releaseReason =
      resolved.lineStatus === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES
        ? HqStockBookingReleaseReason.HQ_SALES_REMOVED
        : HqStockBookingReleaseReason.HQ_SALES_REJECTED;
    await deps.hqStockBookingService.releaseBookingInTx(tx, user, bookingId, releaseReason);
    await deps.auditInTx(tx, user, context.branchId, 'HQ_STOCK_BOOKING_RELEASED', 'HqStockBooking', bookingId, {
      requestId: context.requestId,
      requestLineId: item.id,
      reason: releaseReason,
    });
  }

  if (resolved.unavailableQuantity > 0 || resolved.approvedQuantity < item.quantity) {
    const missingQty = Math.max(item.quantity - resolved.approvedQuantity, 0);
    const availableQty = generalAvailable + bookedQuantity;
    const shortageData = {
      requestedQty: item.quantity,
      availableQty,
      approvedQty: resolved.approvedQuantity,
      missingQty,
      assignedHqWarehouseId: context.assignedHqWarehouseId,
      status:
        resolved.approvedQuantity === 0
          ? BranchRequestShortageStatus.OPEN
          : BranchRequestShortageStatus.PARTIALLY_FULFILLED,
    };
    const existingShortage = await tx.branchRequestShortage.findFirst({
      where: { branchRequestItemId: item.id },
      orderBy: { createdAt: 'desc' },
    });
    if (existingShortage) {
      await tx.branchRequestShortage.update({
        where: { id: existingShortage.id },
        data: shortageData,
      });
    } else {
      await tx.branchRequestShortage.create({
        data: {
          branchRequestId: context.requestId,
          branchRequestItemId: item.id,
          branchId: context.branchId,
          productId: item.productId,
          ...shortageData,
        },
      });
    }
  }

  return {
    itemId: item.id,
    ...resolved,
    generalAvailable,
    bookedQuantity: resolved.approvedQuantity > 0 ? resolved.approvedQuantity : 0,
  };
}

export async function completeBranchPurchaseRequestReviewInTx(
  tx: PrismaTx,
  user: AuthUser,
  requestId: string,
  branchId: string,
  assignedHqWarehouseId: string,
  resolvedLines: AppliedBranchPurchaseLineReview[],
  auditInTx: ApplyLineReviewDeps['auditInTx'],
) {
  const derivedStatus = deriveRequestStatusFromLines(
    resolvedLines.map((line) => ({
      lineStatus: line.lineStatus,
      approvedQuantity: line.approvedQuantity,
      unavailableQuantity: line.unavailableQuantity,
    })),
  );

  const requestStatus =
    derivedStatus === 'REJECTED'
      ? BranchPurchaseRequestStatus.REJECTED
      : BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION;

  // Full authoritative order total from persisted payable line totals (already recalculated).
  const reviewedEstimatedAmountKgs = await recalculateBranchPurchaseRequestReviewTotalsInTx(
    tx,
    requestId,
    branchId,
  );

  const branchConfirmationExpiresAt = addBookingHours(new Date(), BRANCH_CONFIRMATION_BOOKING_HOURS);

  const request = await tx.branchPurchaseRequest.update({
    where: { id: requestId },
    data: {
      status: requestStatus,
      reviewedById: user.id,
      reviewedAt: new Date(),
      assignedHqWarehouseId,
      totalEstimatedAmount: reviewedEstimatedAmountKgs,
      bookingExpiresAt:
        requestStatus === BranchPurchaseRequestStatus.PENDING_BRANCH_CONFIRMATION
          ? branchConfirmationExpiresAt
          : null,
    },
    include: {
      items: branchPurchaseRequestItemsInclude,
      createdBy: { select: { id: true, fullName: true, role: true } },
      branch: { select: { id: true, name: true } },
      assignedHqWarehouse: { select: { id: true, name: true } },
    },
  });

  await auditInTx(tx, user, branchId, 'HQ_SALES_REVIEW_COMPLETED', 'BranchPurchaseRequest', requestId, {
    requestId,
    branchId,
    reviewedById: user.id,
    timestamp: new Date().toISOString(),
    derivedStatus,
    newStatus: requestStatus,
  });

  return { request, derivedStatus, requestStatus };
}
