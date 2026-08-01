import { roundDisplayMoney, sumDisplayMoneyTotals } from '../pricing/product-cost-precision.util';

export type InventoryCountSummaryLine = {
  actualQuantity: number | null;
  differenceQuantity: number;
  differenceValueKgs: number;
};

/**
 * Authoritative inventory-count discrepancy total (HQ and Branch share this formula).
 * Monetary values must already be computed by FIFO valuation on each line.
 */
export function buildInventoryCountDiscrepancySummary(items: InventoryCountSummaryLine[]) {
  const totalProducts = items.length;
  const countedProducts = items.filter((item) => item.actualQuantity !== null).length;
  const shortages = items.filter((item) => item.differenceQuantity < 0).length;
  const overages = items.filter((item) => item.differenceQuantity > 0).length;
  const matched = items.filter(
    (item) => item.differenceQuantity === 0 && item.actualQuantity !== null,
  ).length;
  const surplusValueKgs = roundDisplayMoney(
    items
      .filter((item) => item.differenceQuantity > 0)
      .reduce((sum, item) => sum + Number(item.differenceValueKgs), 0),
  );
  const shortageValueKgs = roundDisplayMoney(
    items
      .filter((item) => item.differenceQuantity < 0)
      .reduce((sum, item) => sum + Number(item.differenceValueKgs), 0),
  );
  const totalDifferenceValueKgs = sumDisplayMoneyTotals(
    items.map((item) => Number(item.differenceValueKgs)),
  );

  return {
    totalProducts,
    countedProducts,
    remainingProducts: totalProducts - countedProducts,
    shortages,
    overages,
    matched,
    surplusValueKgs,
    shortageValueKgs,
    totalDifferenceValueKgs,
  };
}
