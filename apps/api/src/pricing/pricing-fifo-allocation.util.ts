import { applyHqBranchWholesaleMarkup, resolveHqToBranchPrice } from './pricing-calculator.util';
import {
  allocateLayerConsumptionCost,
  allocateProportionalCost,
  deriveDisplayUnitCost,
  reconcileAuthoritativeLineCosts,
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
  const rawLineCosts: number[] = [];
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
      layer.layerTotalCostKgs != null && Number(layer.layerTotalCostKgs) > 0
        ? Number(layer.layerTotalCostKgs)
        : allocateProportionalCost(
            Number(layer.unitCostKgs) * layerBaseQty,
            layerBaseQty,
            layerBaseQty,
          );

    const lineCost = allocateLayerConsumptionCost({
      layerTotalCostKgs,
      layerBaseQuantity: layerBaseQty,
      remainingQuantity: layer.remainingQuantity,
      takeQuantity: take,
    });
    rawLineCosts.push(allocateProportionalCost(layerTotalCostKgs, layerBaseQty, take));
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

    totalPriceKgs += linePrice;
    remainingToAllocate -= take;
  }

  if (lines.length > 1) {
    const reconciledCosts = reconcileAuthoritativeLineCosts(rawLineCosts);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      const lineCost = reconciledCosts[index] ?? line.totalCostKgs;
      const unitCostKgs = deriveDisplayUnitCost(lineCost, line.quantity);
      const unitPriceKgs =
        options.branchType === 'HQ_BRANCH'
          ? unitCostKgs
          : resolveHqToBranchPrice(unitCostKgs, options.branchType ?? 'FRANCHISE', options.markupPercent);
      const linePrice =
        options.branchType === 'HQ_BRANCH' ? lineCost : roundDisplayMoney(unitPriceKgs * line.quantity);
      line.unitCostKgs = unitCostKgs;
      line.unitPriceKgs = unitPriceKgs;
      line.wholesalePriceKgs = roundMoney(Number(line.wholesalePriceKgs ?? unitPriceKgs));
      line.hqBranchWholesalePriceKgs = roundMoney(
        Number(
          line.hqBranchWholesalePriceKgs ??
            applyHqBranchWholesaleMarkup(unitCostKgs, options.markupPercent),
        ),
      );
      line.totalCostKgs = lineCost;
      line.totalPriceKgs = linePrice;
      line.profitKgs = roundDisplayMoney(linePrice - lineCost);
    }
    totalPriceKgs = sumDisplayMoneyTotals(lines.map((line) => line.totalPriceKgs));
  }

  let totalCostKgs = 0;

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
