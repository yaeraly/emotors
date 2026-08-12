import { BranchPurchaseRequestLineStatus } from '@prisma/client';
import { isMoneyEqual, multiplyMoney, toMoneyDecimal, toStoredMoneyKgs } from '../common/money/money';
import {
  allocateLayerConsumptionCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { shouldTransferBranchPurchaseAtCost } from './branch-purchase-estimated-amount.util';

/**
 * Authoritative BPR money.
 *
 * Franchise / dealer: frozen Цена для филиала × effective quantity.
 * HQ Branch (markup 0%): exact FIFO/inventory line cost. Never reconstruct from
 * rounded display unit × quantity (that is the 914369.80 → 914368.98 drift).
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
  estimatedLineProductCostKgs?: unknown;
  branchType?: string | null;
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
  const price = toStoredMoneyKgs(toMoneyDecimal(raw));
  if (price <= 0) return null;
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
 * Authoritative commercial line total.
 *
 * HQ Branch: FIFO/inventory line cost (`estimatedLineProductCostKgs`).
 * Other branches: effectiveQuantity × saved order-line Цена для филиала.
 */
export function calculateBprLineTotalKgs(
  item: BprMoneyLine,
  stage: BprMoneyStage = 'draft',
): number {
  const qty = getBprEffectiveQuantity(item, stage);
  if (qty <= 0) return 0;

  if (shouldTransferBranchPurchaseAtCost(item.branchType)) {
    return resolveHqBranchBprLineTotalKgs(item, qty);
  }

  const unit = getBprSavedOrderLineUnitPriceKgs(item);
  const commercial =
    unit != null && unit > 0 ? toStoredMoneyKgs(multiplyMoney(unit, qty)) : 0;

  if (stage === 'reviewed') {
    const approved =
      item.approvedLineTotalKgs != null
        ? roundDisplayMoney(Number(item.approvedLineTotalKgs))
        : null;
    if (approved != null && approved > 0) {
      if (commercial <= 0 || approved === commercial) {
        return approved;
      }
      return commercial;
    }
  }

  if (commercial > 0) return commercial;

  const stored = roundDisplayMoney(Number(item.totalAmount ?? 0));
  return stored > 0 ? stored : 0;
}

/**
 * HQ Office → HQ Branch: payable line = exact FIFO snapshot.
 * Final remaining qty of a snapshot uses the exact remaining cost, never unit × qty.
 */
function resolveHqBranchBprLineTotalKgs(item: BprMoneyLine, qty: number): number {
  const requested = Math.max(Number(item.quantity ?? 0), 0);
  const fifo = toStoredMoneyKgs(toMoneyDecimal(item.estimatedLineProductCostKgs));
  const approvedStored =
    item.approvedLineTotalKgs != null
      ? toStoredMoneyKgs(toMoneyDecimal(item.approvedLineTotalKgs))
      : 0;
  const stored = toStoredMoneyKgs(toMoneyDecimal(item.totalAmount));

  if (fifo > 0) {
    if (qty === requested || requested <= 0) {
      return fifo;
    }
    if (approvedStored > 0 && isMoneyEqual(approvedStored, fifo)) {
      return fifo;
    }
    return allocateLayerConsumptionCost({
      layerTotalCostKgs: fifo,
      layerBaseQuantity: requested,
      remainingQuantity: requested,
      takeQuantity: qty,
    });
  }
  if (approvedStored > 0) return approvedStored;
  if (stored > 0) return stored;
  return 0;
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
    ok: isMoneyEqual(differenceKgs, 0),
    beforeKgs,
    afterKgs,
    differenceKgs,
  };
}
