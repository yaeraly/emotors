import { BranchType } from '@prisma/client';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import { resolveHqBranchTransferLineCostKgs, sumHqBranchTransferLineCosts } from './hq-branch-transfer-cost.util';

export const BRANCH_ESTIMATED_AMOUNT_MISMATCH_MESSAGE =
  'Ориентировочная сумма не совпадает с себестоимостью товаров. Обновите расчет заказа.';

/** HQ-owned branches receive stock at exact себестоимость (no markup). */
export function shouldTransferBranchPurchaseAtCost(
  branchType?: BranchType | string | null,
): boolean {
  return branchType === BranchType.HQ_BRANCH || branchType === 'HQ_BRANCH';
}

/**
 * Authoritative payable line amount for a branch purchase line.
 * At-cost transfers use FIFO/landed line total — never rounded unit × qty.
 */
export function resolveBranchPurchaseLinePayableAmount(input: {
  branchType?: BranchType | string | null;
  quantity: number;
  estimatedLineProductCostKgs?: number | null;
  unitPriceKgs?: number | null;
  hasPricingPolicy?: boolean;
}): number {
  const quantity = Math.max(0, Number(input.quantity ?? 0));

  // HQ_BRANCH internal transfer: payable is exact FIFO/landed line cost only.
  // Never reconstruct from rounded display unit × quantity (causes 0.72-style drift).
  if (shouldTransferBranchPurchaseAtCost(input.branchType)) {
    return resolveHqBranchTransferLineCostKgs({
      fifoLineCostKgs: input.estimatedLineProductCostKgs,
    });
  }

  const fifoLineCost = roundDisplayMoney(Number(input.estimatedLineProductCostKgs ?? 0));

  const unitPrice = Number(input.unitPriceKgs ?? 0);
  if (input.hasPricingPolicy !== false && unitPrice > 0 && quantity > 0) {
    return roundDisplayMoney(unitPrice * quantity);
  }

  return fifoLineCost > 0 ? fifoLineCost : 0;
}

/** Header "Ориентировочная сумма" for at-cost transfers equals FIFO product cost. */
export function resolveBranchPurchaseEstimatedAmountKgs(input: {
  branchType?: BranchType | string | null;
  totalProductCostKgs?: number | null;
  lineProductCosts?: number[];
  storedEstimatedAmountKgs?: number | null;
}): number {
  const productCost =
    Number(input.totalProductCostKgs ?? 0) > 0
      ? roundDisplayMoney(Number(input.totalProductCostKgs))
      : input.lineProductCosts?.length
        ? sumDisplayMoneyTotals(input.lineProductCosts.map((value) => Number(value ?? 0)))
        : 0;

  if (shouldTransferBranchPurchaseAtCost(input.branchType) && productCost > 0) {
    return productCost;
  }

  const stored = roundDisplayMoney(Number(input.storedEstimatedAmountKgs ?? 0));
  return stored > 0 ? stored : productCost;
}

export function compareEstimatedAmountToProductCost(
  estimatedAmountKgs: number,
  productCostKgs: number,
): { ok: boolean; expectedKgs: number; actualKgs: number; differenceKgs: number } {
  const expectedKgs = roundDisplayMoney(productCostKgs);
  const actualKgs = roundDisplayMoney(estimatedAmountKgs);
  const differenceKgs = roundDisplayMoney(actualKgs - expectedKgs);
  return {
    ok: Math.abs(differenceKgs) <= 0,
    expectedKgs,
    actualKgs,
    differenceKgs,
  };
}

export function deriveUnitFromAuthoritativeLineTotal(lineTotalKgs: number, quantity: number) {
  return deriveDisplayUnitCost(lineTotalKgs, quantity);
}

/**
 * Permanent HQ Branch transfer invariant:
 * Σ(FIFO/inventory line costs) = Σ(BPR payable line totals) = order total
 * when markup = 0%. Difference must be 0.00 KGS.
 */
export function reconcileHqBranchTransferCostParity(input: {
  fifoLineCosts: number[];
  payableLineTotals: number[];
  orderTotalKgs: number;
}): { ok: boolean; expectedKgs: number; actualKgs: number; differenceKgs: number } {
  const expectedKgs = sumHqBranchTransferLineCosts(input.fifoLineCosts);
  const payableSum = sumHqBranchTransferLineCosts(input.payableLineTotals);
  const actualKgs = resolveHqBranchTransferLineCostKgs({ fifoLineCostKgs: input.orderTotalKgs });
  const differenceKgs = roundDisplayMoney(actualKgs - expectedKgs);
  return {
    ok: expectedKgs === payableSum && payableSum === actualKgs && Math.abs(differenceKgs) <= 0,
    expectedKgs,
    actualKgs,
    differenceKgs,
  };
}
