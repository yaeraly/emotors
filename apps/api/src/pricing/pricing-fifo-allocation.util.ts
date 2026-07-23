import { applyHqBranchWholesaleMarkup, resolveHqToBranchPrice } from './pricing-calculator.util';

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
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

    const unitCostKgs = roundMoney(Number(layer.unitCostKgs));
    const unitPriceKgs =
      options.branchType === 'HQ_BRANCH'
        ? unitCostKgs
        : resolveHqToBranchPrice(unitCostKgs, options.branchType ?? 'FRANCHISE', options.markupPercent);
    const lineCost = roundMoney(unitCostKgs * take);
    const linePrice = roundMoney(unitPriceKgs * take);
    const profitKgs = roundMoney(linePrice - lineCost);

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

    totalCostKgs = roundMoney(totalCostKgs + lineCost);
    totalPriceKgs = roundMoney(totalPriceKgs + linePrice);
    remainingToAllocate -= take;
  }

  const allocatedQty = quantity - remainingToAllocate;
  const first = lines[0];
  return {
    lines,
    allocatedQty,
    totalCostKgs,
    totalPriceKgs,
    profitKgs: roundMoney(totalPriceKgs - totalCostKgs),
    activeUnitCostKgs: first?.unitCostKgs ?? 0,
    activeUnitPriceKgs: first?.unitPriceKgs ?? 0,
  };
}
