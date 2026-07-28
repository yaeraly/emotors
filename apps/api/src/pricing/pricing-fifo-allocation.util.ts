import { applyHqBranchWholesaleMarkup, resolveHqToBranchPrice } from './pricing-calculator.util';
import {
  allocateProportionalCost,
  deriveDisplayUnitCost,
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
    unitCostKgs: number;
    /** Authoritative movement/batch total cost (preferred over unit × qty). */
    layerTotalCostKgs?: number;
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
} {
  let remainingToAllocate = Math.max(0, quantity);
  const lines: FifoAllocationLineResult[] = [];
  let totalCostKgs = 0;
  let totalPriceKgs = 0;

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
    const layerTotalCostKgs =
      Number(layer.layerTotalCostKgs ?? 0) > 0
        ? Number(layer.layerTotalCostKgs)
        : Number(layer.unitCostKgs) * layerBaseQty;

    const lineCost = roundDisplayMoney(allocateProportionalCost(layerTotalCostKgs, layerBaseQty, take));
    const unitCostKgs = deriveDisplayUnitCost(lineCost, take);
    const unitPriceKgs =
      options.branchType === 'HQ_BRANCH'
        ? unitCostKgs
        : resolveHqToBranchPrice(unitCostKgs, options.branchType ?? 'FRANCHISE', options.markupPercent);
    const linePrice =
      options.branchType === 'HQ_BRANCH'
        ? lineCost
        : roundDisplayMoney(unitPriceKgs * take);
    const profitKgs = roundDisplayMoney(linePrice - lineCost);

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
      totalCostKgs: lineCost,
      totalPriceKgs: linePrice,
      profitKgs,
    });

    totalCostKgs += lineCost;
    totalPriceKgs += linePrice;
    remainingToAllocate -= take;
  }

  const allocatedQty = quantity - remainingToAllocate;
  const first = lines[0];
  const summedCostKgs = sumDisplayMoneyTotals(lines.map((line) => line.totalCostKgs));
  const summedPriceKgs = sumDisplayMoneyTotals(lines.map((line) => line.totalPriceKgs));
  return {
    lines,
    allocatedQty,
    totalCostKgs: summedCostKgs,
    totalPriceKgs: summedPriceKgs,
    profitKgs: roundDisplayMoney(summedPriceKgs - summedCostKgs),
    activeUnitCostKgs: first?.unitCostKgs ?? 0,
    activeUnitPriceKgs: first?.unitPriceKgs ?? 0,
  };
}
