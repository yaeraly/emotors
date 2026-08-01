import {
  BranchPurchaseRequestLineStatus,
  BranchRequestLineRejectionReason,
} from '@prisma/client';

export type LineReviewAction = 'APPROVE' | 'PARTIAL' | 'REJECT' | 'REMOVE';

export type LineReviewInput = {
  id: string;
  action: LineReviewAction;
  approvedQuantity?: number;
  publicComment?: string;
};

export type LineReviewContext = {
  requestedQuantity: number;
  availableQuantity: number;
  bookedQuantity?: number;
  hasPricingPolicy: boolean;
};

function availableForApproval(context: LineReviewContext) {
  const general = Math.max(context.availableQuantity, 0);
  const booked = Math.max(context.bookedQuantity ?? 0, 0);
  return general + booked;
}

export type ResolvedLineReview = {
  lineStatus: BranchPurchaseRequestLineStatus;
  approvedQuantity: number;
  unavailableQuantity: number;
  rejectionReasonCode: BranchRequestLineRejectionReason | null;
  publicComment: string | null;
  hasPricingPolicy: boolean;
  notifyCeoNoPricingPolicy: boolean;
  notifyCeoOutOfStock: boolean;
};

const DEFAULT_NO_PRICING_COMMENT =
  'Для данного товара не настроена ценовая политика.';
const DEFAULT_OUT_OF_STOCK_COMMENT = 'Недостаточно товара на складе HQ';

export function resolveLineReview(
  input: LineReviewInput,
  context: LineReviewContext,
): ResolvedLineReview {
  const requested = Math.max(context.requestedQuantity, 0);
  const available = availableForApproval(context);
  const comment = input.publicComment?.trim() || null;

  if (!context.hasPricingPolicy) {
    if (input.action === 'APPROVE' || input.action === 'PARTIAL') {
      throw new Error('NO_PRICING_POLICY');
    }
  }

  if (input.action === 'REMOVE') {
    return {
      lineStatus: BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES,
      approvedQuantity: 0,
      unavailableQuantity: requested,
      rejectionReasonCode: BranchRequestLineRejectionReason.OTHER,
      publicComment: comment || 'Товар убран из исполнения',
      hasPricingPolicy: context.hasPricingPolicy,
      notifyCeoNoPricingPolicy: false,
      notifyCeoOutOfStock: available <= 0,
    };
  }

  if (input.action === 'REJECT') {
    const reason =
      available <= 0
        ? BranchRequestLineRejectionReason.OUT_OF_STOCK
        : BranchRequestLineRejectionReason.OTHER;
    return {
      lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
      approvedQuantity: 0,
      unavailableQuantity: requested,
      rejectionReasonCode: reason,
      publicComment:
        comment ||
        (reason === BranchRequestLineRejectionReason.OUT_OF_STOCK
          ? DEFAULT_OUT_OF_STOCK_COMMENT
          : 'Товар не утверждён'),
      hasPricingPolicy: context.hasPricingPolicy,
      notifyCeoNoPricingPolicy: false,
      notifyCeoOutOfStock: available <= 0,
    };
  }

  if (available <= 0) {
    return {
      lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
      approvedQuantity: 0,
      unavailableQuantity: requested,
      rejectionReasonCode: BranchRequestLineRejectionReason.OUT_OF_STOCK,
      publicComment: comment || DEFAULT_OUT_OF_STOCK_COMMENT,
      hasPricingPolicy: context.hasPricingPolicy,
      notifyCeoNoPricingPolicy: false,
      notifyCeoOutOfStock: true,
    };
  }

  const rawApproved =
    input.action === 'PARTIAL'
      ? Number(input.approvedQuantity ?? 0)
      : input.action === 'APPROVE'
        ? requested
        : 0;

  if (!Number.isFinite(rawApproved)) {
    throw new Error('INVALID_APPROVED_QUANTITY');
  }

  const requestedApproved = Math.max(0, Math.floor(rawApproved));

  if (requestedApproved > requested) {
    throw new Error('APPROVED_QUANTITY_EXCEEDS_REQUESTED');
  }

  const hasStockShortage = requested > available;

  if (requestedApproved <= 0) {
    return {
      lineStatus: BranchPurchaseRequestLineStatus.REJECTED,
      approvedQuantity: 0,
      unavailableQuantity: requested,
      rejectionReasonCode: BranchRequestLineRejectionReason.OTHER,
      publicComment: comment || 'Товар не утверждён',
      hasPricingPolicy: context.hasPricingPolicy,
      notifyCeoNoPricingPolicy: false,
      notifyCeoOutOfStock: false,
    };
  }

  if (requestedApproved > available) {
    throw new Error('APPROVED_QUANTITY_EXCEEDS_AVAILABLE');
  }

  if (
    input.action === 'PARTIAL' &&
    requestedApproved < requested &&
    !comment
  ) {
    return {
      lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
      approvedQuantity: requestedApproved,
      unavailableQuantity: requested - requestedApproved,
      rejectionReasonCode: null,
      publicComment: `На складе HQ доступно только ${requestedApproved} шт.`,
      hasPricingPolicy: context.hasPricingPolicy,
      notifyCeoNoPricingPolicy: false,
      notifyCeoOutOfStock: hasStockShortage,
    };
  }

  if (requestedApproved >= requested) {
    return {
      lineStatus: BranchPurchaseRequestLineStatus.APPROVED,
      approvedQuantity: requested,
      unavailableQuantity: 0,
      rejectionReasonCode: null,
      publicComment: comment,
      hasPricingPolicy: context.hasPricingPolicy,
      notifyCeoNoPricingPolicy: false,
      notifyCeoOutOfStock: false,
    };
  }

  return {
    lineStatus: BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
    approvedQuantity: requestedApproved,
    unavailableQuantity: requested - requestedApproved,
    rejectionReasonCode: null,
    publicComment: comment,
    hasPricingPolicy: context.hasPricingPolicy,
    notifyCeoNoPricingPolicy: false,
    notifyCeoOutOfStock: hasStockShortage,
  };
}

export function deriveRequestStatusFromLines(
  lines: Array<{
    lineStatus: BranchPurchaseRequestLineStatus;
    approvedQuantity: number;
    unavailableQuantity?: number;
  }>,
) {
  const hasApproved = lines.some((line) => line.approvedQuantity > 0);
  const hasPartial = lines.some(
    (line) => line.lineStatus === BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED,
  );
  const allRejected = lines.every(
    (line) =>
      line.lineStatus === BranchPurchaseRequestLineStatus.REJECTED ||
      line.lineStatus === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES,
  );

  if (!hasApproved && allRejected) {
    return 'REJECTED' as const;
  }
  if (
    hasPartial ||
    lines.some(
      (line) => (line.unavailableQuantity ?? 0) > 0 && line.approvedQuantity > 0,
    )
  ) {
    return 'PARTIALLY_APPROVED' as const;
  }
  return 'APPROVED' as const;
}
