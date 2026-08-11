import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import {
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';

/**
 * Authoritative BPR commercial money.
 *
 * BPR commercial totals (Сумма / totalEstimatedAmount / invoice payable) always use
 * the frozen order-line Цена для филиала snapshot × effective quantity.
 *
 * Inventory FIFO (`estimatedLineProductCostKgs`) is a separate concept and must not
 * replace the commercial BPR amount on role/status transitions.
 */

export type BprMoneyLine = {
  quantity: number;
  approvedQuantity?: number | null;
  lineStatus?: BranchPurchaseRequestLineStatus | string | null;
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  wholesalePriceKgs?: unknown;
  totalAmount?: unknown;
  approvedLineTotalKgs?: unknown;
};

export type BprMoneyStage = 'draft' | 'pending_hq_review' | 'reviewed';

export function getBprSavedOrderLineUnitPriceKgs(item: {
  branchPurchasePriceKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  wholesalePriceKgs?: unknown;
}): number | null {
  const raw =
    item.resolvedBranchPriceKgs ?? item.branchPurchasePriceKgs ?? item.wholesalePriceKgs;
  if (raw == null) return null;
  const price = Number(raw);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

export function getBprEffectiveQuantity(
  item: Pick<BprMoneyLine, 'quantity' | 'approvedQuantity' | 'lineStatus'>,
  stage: BprMoneyStage = 'draft',
): number {
  const requested = Math.max(Number(item.quantity ?? 0), 0);
  if (stage === 'draft' || stage === 'pending_hq_review') {
    return requested;
  }

  const status = item.lineStatus ?? BranchPurchaseRequestLineStatus.PENDING_REVIEW;
  if (
    status === BranchPurchaseRequestLineStatus.REJECTED ||
    status === BranchPurchaseRequestLineStatus.REMOVED_BY_HQ_SALES ||
    status === 'REJECTED' ||
    status === 'REMOVED_BY_HQ_SALES'
  ) {
    return 0;
  }
  if (
    status === BranchPurchaseRequestLineStatus.APPROVED ||
    status === BranchPurchaseRequestLineStatus.PARTIALLY_APPROVED ||
    status === 'APPROVED' ||
    status === 'PARTIALLY_APPROVED'
  ) {
    return Math.max(Number(item.approvedQuantity ?? 0), 0);
  }
  return requested;
}

/**
 * Authoritative commercial line total:
 * effectiveQuantity × saved order-line Цена для филиала.
 *
 * Prefer a persisted approvedLineTotal/totalAmount only when it already matches
 * that commercial formula (avoids replacing a correct snapshot with a rebuild).
 */
export function calculateBprLineTotalKgs(
  item: BprMoneyLine,
  stage: BprMoneyStage = 'draft',
): number {
  const qty = getBprEffectiveQuantity(item, stage);
  if (qty <= 0) return 0;

  const unit = getBprSavedOrderLineUnitPriceKgs(item);
  const commercial =
    unit != null && unit > 0 ? roundDisplayMoney(unit * qty) : 0;

  if (stage === 'reviewed') {
    const approved =
      item.approvedLineTotalKgs != null
        ? roundDisplayMoney(Number(item.approvedLineTotalKgs))
        : null;
    if (approved != null && approved > 0) {
      if (commercial <= 0 || Math.abs(approved - commercial) <= 0.009) {
        return approved;
      }
      // Persisted payable drifted from saved price × qty — restore commercial snapshot.
      return commercial;
    }
  }

  if (commercial > 0) return commercial;

  const stored = roundDisplayMoney(Number(item.totalAmount ?? 0));
  return stored > 0 ? stored : 0;
}

export function calculateBprOrderTotalKgs(
  items: BprMoneyLine[],
  stage: BprMoneyStage = 'draft',
): number {
  return sumDisplayMoneyTotals(items.map((item) => calculateBprLineTotalKgs(item, stage)));
}

export function resolveBprMoneyStage(input: {
  status?: string | null;
  reviewedAt?: Date | string | null;
}): BprMoneyStage {
  const status = input.status ?? null;
  if (status === 'DRAFT') return 'draft';
  if (status === 'SUBMITTED' || status === 'SUBMITTED_TO_HQ') return 'pending_hq_review';
  if (input.reviewedAt) return 'reviewed';
  const reviewedStatuses = new Set([
    'APPROVED',
    'PARTIALLY_APPROVED',
    'REJECTED',
    'PENDING_BRANCH_CONFIRMATION',
    'BRANCH_CONFIRMED',
    'BRANCH_DECLINED',
    'READY_FOR_HQ_WAREHOUSE',
    'SENT_TO_HQ_WAREHOUSE',
    'SHIPPED',
    'RECEIVED',
    'RECEIVED_WITH_DIFFERENCE',
    'COMPLETED',
    'PAYMENT_CONFIRMED',
    'PAYMENT_SUBMITTED',
    'PENDING_PAYMENT',
    'PENDING_INSTALLMENT_APPROVAL',
  ]);
  if (status && reviewedStatuses.has(status)) return 'reviewed';
  return 'pending_hq_review';
}

/** Status transitions must preserve money unless qty/price intentionally changed. */
export function assertBprMoneyNeutralTransition(
  beforeTotalKgs: number,
  afterTotalKgs: number,
  options?: { quantityOrPriceChanged?: boolean },
): { ok: boolean; beforeKgs: number; afterKgs: number; differenceKgs: number } {
  const beforeKgs = roundDisplayMoney(Number(beforeTotalKgs ?? 0));
  const afterKgs = roundDisplayMoney(Number(afterTotalKgs ?? 0));
  const differenceKgs = roundDisplayMoney(afterKgs - beforeKgs);
  if (options?.quantityOrPriceChanged) {
    return { ok: true, beforeKgs, afterKgs, differenceKgs };
  }
  return {
    ok: Math.abs(differenceKgs) <= 0,
    beforeKgs,
    afterKgs,
    differenceKgs,
  };
}
