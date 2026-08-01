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
import { sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';
import {
  resolveBranchPurchaseEstimatedAmountKgs,
  resolveBranchPurchaseLinePayableAmount,
} from './branch-purchase-estimated-amount.util';
import { resolveBranchPurchaseFifoLineCost } from './branch-purchase-fifo-cost.util';
import {
  deriveRequestStatusFromLines,
  resolveLineReview,
  type LineReviewInput,
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

export async function applyBranchPurchaseLineReviewInTx(
  tx: PrismaTx,
  user: AuthUser,
  deps: ApplyLineReviewDeps,
  item: BranchPurchaseRequestItemRow,
  input: LineReviewInput,
  context: BranchPurchaseLineReviewContext,
  reviewBranch: { branchType: BranchType | null; hqToBranchMarkupPercent: Prisma.Decimal | number | null } | null,
): Promise<AppliedBranchPurchaseLineReview> {
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

  const payableLineAmount =
    resolved.approvedQuantity > 0
      ? resolveBranchPurchaseLinePayableAmount({
          branchType: reviewBranch?.branchType,
          quantity: resolved.approvedQuantity,
          estimatedLineProductCostKgs,
          unitPriceKgs: Number(item.resolvedBranchPriceKgs ?? 0),
          hasPricingPolicy,
        })
      : 0;

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
      approvedLineTotalKgs: payableLineAmount > 0 ? payableLineAmount : null,
      totalAmount: payableLineAmount,
      bookingExpiresAt: resolved.approvedQuantity > 0 ? context.branchConfirmationExpiresAt : null,
      bookedQuantity: resolved.approvedQuantity > 0 ? resolved.approvedQuantity : 0,
      estimatedLineProductCostKgs,
      estimatedUnitCost,
    },
  });

  const bookingId = context.bookingIdByLine.get(item.id);
  if (bookingId) {
    if (resolved.approvedQuantity > 0) {
      await deps.hqStockBookingService.confirmBookingInTx(
        tx,
        user,
        bookingId,
        resolved.approvedQuantity,
        context.branchConfirmationExpiresAt,
      );
      await deps.auditInTx(tx, user, context.branchId, 'HQ_STOCK_BOOKING_CONFIRMED', 'HqStockBooking', bookingId, {
        requestId: context.requestId,
        requestLineId: item.id,
        approvedQuantity: resolved.approvedQuantity,
      });
    } else {
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
    bookedQuantity,
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

  const refreshedItems = await tx.branchPurchaseRequestItem.findMany({
    where: { requestId },
    select: {
      approvedQuantity: true,
      quantity: true,
      estimatedLineProductCostKgs: true,
      totalAmount: true,
    },
  });
  const reviewedProductCostKgs = sumDisplayMoneyTotals(
    refreshedItems.map((row) => {
      const qty = row.approvedQuantity ?? row.quantity;
      return qty > 0 ? Number(row.estimatedLineProductCostKgs ?? 0) : 0;
    }),
  );
  const reviewBranch = await tx.branch.findFirst({
    where: { id: branchId, deletedAt: null },
    select: { branchType: true },
  });
  const reviewedEstimatedAmountKgs = resolveBranchPurchaseEstimatedAmountKgs({
    branchType: reviewBranch?.branchType,
    totalProductCostKgs: reviewedProductCostKgs,
    storedEstimatedAmountKgs: sumDisplayMoneyTotals(
      refreshedItems.map((row) => Number(row.totalAmount ?? 0)),
    ),
  });

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
      items: true,
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
