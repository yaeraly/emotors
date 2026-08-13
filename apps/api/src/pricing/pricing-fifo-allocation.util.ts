import { Prisma } from '@prisma/client';
import { applyHqBranchWholesaleMarkup, resolveHqToBranchPrice } from './pricing-calculator.util';
import {
  sumMoney,
  toExactMoney,
  toMoneyDecimal,
  type MoneyInput,
} from '../common/money/money';
import {
  allocateLayerConsumptionCostExact,
  deriveDisplayUnitCost,
  deriveExactUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from './product-cost-precision.util';

export type FifoAllocationLineInput = {
  batchId: string;
  quantity: number;
  unitCostKgs: number;
  unitPriceKgs: number;
  wholesalePriceKgs?: number;
  hqBranchWholesalePriceKgs?: number;
  markupPercent?: number;
};

export type FifoAllocationLineResult = FifoAllocationLineInput & {
  totalCostKgs: number;
  totalPriceKgs: number;
  profitKgs: number;
  /** Authoritative line себестоимость. Persist this; do not rebuild from unitCostKgs × qty. */
  authoritativeLineTotal: Prisma.Decimal;
};

function roundMoney(value: number) {
  return roundDisplayMoney(value);
}

/**
 * Build per-layer FIFO allocation lines with independent markup on each layer.
 * Never averages cost before applying markup.
 */
export function buildFifoAllocationLines(
  layers: Array<{
    batchId: string;
    remainingQuantity: number;
    reservedQuantity?: number;
    unitCostKgs: number | MoneyInput;
    /** Authoritative movement/batch total cost (preferred over unit × qty). */
    layerTotalCostKgs?: MoneyInput;
    remainingLayerCostKgs?: MoneyInput;
    /** Quantity basis for layerTotalCostKgs (initial received qty). */
    layerBaseQuantity?: number;
    wholesalePriceKgs?: number;
    hqBranchWholesalePriceKgs?: number;
  }>,
  quantity: number,
  options: {
    markupPercent: number;
    branchType?: 'HQ_BRANCH' | 'FRANCHISE' | 'DEALER' | 'DISTRIBUTOR';
    /** When true, available = remaining - reserved */
    subtractReserved?: boolean;
  },
): {
  lines: FifoAllocationLineResult[];
  allocatedQty: number;
  totalCostKgs: number;
  totalPriceKgs: number;
  profitKgs: number;
  activeUnitCostKgs: number;
  activeUnitPriceKgs: number;
  authoritativeTotal: Prisma.Decimal;
} {
  let remainingToAllocate = Math.max(0, quantity);
  const lines: FifoAllocationLineResult[] = [];
  const exactLineCosts: Prisma.Decimal[] = [];

  for (const layer of layers) {
    if (remainingToAllocate <= 0) break;
    const reserved = Number(layer.reservedQuantity ?? 0);
    const available = options.subtractReserved
      ? Math.max(0, layer.remainingQuantity - reserved)
      : Math.max(0, layer.remainingQuantity);
    const take = Math.min(available, remainingToAllocate);
    if (take <= 0) continue;

    const layerBaseQty =
      Number(layer.layerBaseQuantity ?? 0) > 0
        ? Number(layer.layerBaseQuantity)
        : Math.max(layer.remainingQuantity, take);
    const layerTotalCostKgs = toMoneyDecimal(layer.layerTotalCostKgs).gt(0)
      ? toMoneyDecimal(layer.layerTotalCostKgs)
      : toMoneyDecimal(layer.unitCostKgs).mul(layerBaseQty);

    const lineCostExact = allocateLayerConsumptionCostExact({
      layerTotalCostKgs,
      layerBaseQuantity: layerBaseQty,
      remainingQuantity: layer.remainingQuantity,
      takeQuantity: take,
      remainingLayerCostKgs: layer.remainingLayerCostKgs ?? undefined,
    });
    const lineCost = toExactMoney(lineCostExact);
    const unitCostKgs = Number(deriveExactUnitCost(lineCost, take).toFixed(15));
    const displayUnitCostKgs = deriveDisplayUnitCost(lineCost, take);
    const unitPriceKgs =
      options.branchType === 'HQ_BRANCH'
        ? unitCostKgs
        : resolveHqToBranchPrice(
            displayUnitCostKgs,
            options.branchType ?? 'FRANCHISE',
            options.markupPercent,
          );
    const linePrice =
      options.branchType === 'HQ_BRANCH'
        ? lineCost
        : roundDisplayMoney(unitPriceKgs * take);
    const profitKgs = options.branchType === 'HQ_BRANCH' ? 0 : roundDisplayMoney(toMoneyDecimal(linePrice).minus(lineCost));

    exactLineCosts.push(lineCost);
    lines.push({
      batchId: layer.batchId,
      quantity: take,
      unitCostKgs,
      unitPriceKgs,
      wholesalePriceKgs: roundMoney(Number(layer.wholesalePriceKgs ?? unitPriceKgs)),
      hqBranchWholesalePriceKgs: roundMoney(
        Number(layer.hqBranchWholesalePriceKgs ?? applyHqBranchWholesaleMarkup(unitCostKgs, options.markupPercent)),
      ),
      markupPercent: options.markupPercent,
      totalCostKgs: Number(lineCost.toFixed(15)),
      totalPriceKgs: options.branchType === 'HQ_BRANCH' ? Number(lineCost.toFixed(15)) : Number(linePrice),
      profitKgs,
      authoritativeLineTotal: lineCost,
    });

    remainingToAllocate -= take;
  }

  const allocatedQty = quantity - remainingToAllocate;
  const first = lines[0];
  const authoritativeTotal = toExactMoney(sumMoney(exactLineCosts));
  const summedCostKgs = Number(authoritativeTotal.toFixed(15));
  const summedPriceKgs =
    options.branchType === 'HQ_BRANCH'
      ? summedCostKgs
      : sumDisplayMoneyTotals(lines.map((line) => line.totalPriceKgs));
  return {
    lines,
    allocatedQty,
    totalCostKgs: summedCostKgs,
    totalPriceKgs: summedPriceKgs,
    profitKgs: options.branchType === 'HQ_BRANCH' ? 0 : roundDisplayMoney(summedPriceKgs - summedCostKgs),
    activeUnitCostKgs: first?.unitCostKgs ?? 0,
    activeUnitPriceKgs: first?.unitPriceKgs ?? 0,
    authoritativeTotal,
  };
}
