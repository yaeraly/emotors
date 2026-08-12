import { toMoneyDecimal, toStoredMoneyKgs } from '../common/money/money';
import { allocateLayerConsumptionCost, roundDisplayMoney } from '../pricing/product-cost-precision.util';
import { shouldTransferBranchPurchaseAtCost } from './branch-purchase-estimated-amount.util';

export type ProcurementAuthoritativeLine = {
  productId?: string | null;
  sku?: string | null;
  productName?: string | null;
  quantity: number;
  totalCostKgs: unknown;
};

export type BprRepairTargetLine = {
  id: string;
  productId?: string | null;
  sku?: string | null;
  productName?: string | null;
  quantity: number;
  approvedQuantity?: number | null;
  estimatedLineProductCostKgs?: unknown;
  totalAmount?: unknown;
  resolvedBranchPriceKgs?: unknown;
};

export type HqBranchProcurementLinePatch = {
  itemId: string;
  productName: string;
  sku: string;
  quantity: number;
  procurementLineCostKgs: number;
  oldLineKgs: number;
  newLineKgs: number;
  unitTimesQtyKgs: number;
  differenceKgs: number;
};

/**
 * Repair HQ Branch BPR derived totals from linked procurement authoritative line costs.
 * Never changes procurement amounts or quantities. Never adds a lump-sum kopeck patch.
 */
export function planHqBranchBprRepairFromProcurement(input: {
  branchType?: string | null;
  storedHeaderTotalKgs: unknown;
  procurementItems: ProcurementAuthoritativeLine[];
  bprItems: BprRepairTargetLine[];
}): {
  skipped: boolean;
  oldHeaderTotalKgs: number;
  newHeaderTotalKgs: number;
  procurementSumKgs: number;
  linePatches: HqBranchProcurementLinePatch[];
  unmatchedBprItemIds: string[];
} {
  const oldHeaderTotalKgs = toStoredMoneyKgs(toMoneyDecimal(input.storedHeaderTotalKgs));
  const procurementSumKgs = toStoredMoneyKgs(
    input.procurementItems.reduce(
      (sum, item) => sum.plus(toMoneyDecimal(item.totalCostKgs)),
      toMoneyDecimal(0),
    ),
  );

  if (!shouldTransferBranchPurchaseAtCost(input.branchType)) {
    return {
      skipped: true,
      oldHeaderTotalKgs,
      newHeaderTotalKgs: oldHeaderTotalKgs,
      procurementSumKgs,
      linePatches: [],
      unmatchedBprItemIds: [],
    };
  }

  const unusedProc = [...input.procurementItems];
  const linePatches: HqBranchProcurementLinePatch[] = [];
  const unmatchedBprItemIds: string[] = [];
  let newHeader = toMoneyDecimal(0);

  for (const bprItem of input.bprItems) {
    const qty = Math.max(Number(bprItem.approvedQuantity ?? bprItem.quantity ?? 0), 0);
    if (qty <= 0) continue;

    const matchIndex = unusedProc.findIndex(
      (proc) =>
        (bprItem.productId && proc.productId && proc.productId === bprItem.productId) ||
        (bprItem.sku && proc.sku && proc.sku.trim().toUpperCase() === bprItem.sku.trim().toUpperCase()),
    );
    if (matchIndex < 0) {
      unmatchedBprItemIds.push(bprItem.id);
      const fallback = toStoredMoneyKgs(toMoneyDecimal(bprItem.estimatedLineProductCostKgs));
      newHeader = newHeader.plus(toMoneyDecimal(fallback));
      continue;
    }
    const [proc] = unusedProc.splice(matchIndex, 1);
    const procQty = Math.max(Number(proc?.quantity ?? 0), 0);
    const procCost = toStoredMoneyKgs(toMoneyDecimal(proc?.totalCostKgs));
    const newLineKgs =
      qty === procQty || procQty <= 0
        ? procCost
        : allocateLayerConsumptionCost({
            layerTotalCostKgs: procCost,
            layerBaseQuantity: procQty,
            remainingQuantity: procQty,
            takeQuantity: qty,
          });
    const oldLineKgs = toStoredMoneyKgs(toMoneyDecimal(bprItem.totalAmount));
    const displayUnit = toStoredMoneyKgs(
      procQty > 0 ? toMoneyDecimal(procCost).div(procQty) : toMoneyDecimal(0),
    );
    const unitTimesQtyKgs = toStoredMoneyKgs(toMoneyDecimal(displayUnit).times(qty));
    newHeader = newHeader.plus(toMoneyDecimal(newLineKgs));
    if (Math.abs(oldLineKgs - newLineKgs) > 0.009) {
      linePatches.push({
        itemId: bprItem.id,
        productName: bprItem.productName ?? bprItem.sku ?? bprItem.id,
        sku: bprItem.sku ?? '',
        quantity: qty,
        procurementLineCostKgs: procCost,
        oldLineKgs,
        newLineKgs,
        unitTimesQtyKgs,
        differenceKgs: roundDisplayMoney(oldLineKgs - newLineKgs),
      });
    }
  }

  return {
    skipped: false,
    oldHeaderTotalKgs,
    newHeaderTotalKgs: toStoredMoneyKgs(newHeader),
    procurementSumKgs,
    linePatches,
    unmatchedBprItemIds,
  };
}
