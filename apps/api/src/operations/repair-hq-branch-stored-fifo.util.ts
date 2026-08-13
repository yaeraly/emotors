import { toMoneyDecimal, toStoredMoneyKgs } from '../common/money/money';
import {
  deriveDisplayUnitCost,
  roundDisplayMoney,
  sumDisplayMoneyTotals,
} from '../pricing/product-cost-precision.util';
import {
  calculateBprLineTotalKgs,
  calculateBprOrderTotalKgs,
} from './branch-purchase-authoritative-money.util';
import { shouldTransferBranchPurchaseAtCost } from './branch-purchase-estimated-amount.util';

export type HqBranchStoredFifoRepairLine = {
  id: string;
  productName?: string | null;
  sku?: string | null;
  quantity: number;
  approvedQuantity?: number | null;
  lineStatus?: string | null;
  estimatedLineProductCostKgs: unknown;
  totalAmount: unknown;
  approvedLineTotalKgs?: unknown;
  resolvedBranchPriceKgs?: unknown;
  wholesalePriceKgs?: unknown;
};

export type HqBranchStoredFifoLinePatch = {
  itemId: string;
  productName: string;
  sku: string;
  quantity: number;
  fifoSnapshotKgs: number;
  oldLineKgs: number;
  newLineKgs: number;
  unitTimesQtyKgs: number;
  differenceKgs: number;
};

/**
 * Repair HQ Branch BPR payable totals from the stored FIFO snapshot
 * (`estimatedLineProductCostKgs`). Never re-reads live FIFO and never
 * reconstructs from rounded display unit × quantity.
 */
export function planHqBranchBprRepairFromStoredFifo(input: {
  branchType?: string | null;
  storedHeaderTotalKgs: unknown;
  items: HqBranchStoredFifoRepairLine[];
}): {
  skipped: boolean;
  oldHeaderTotalKgs: number;
  newHeaderTotalKgs: number;
  linePatches: HqBranchStoredFifoLinePatch[];
} {
  const oldHeaderTotalKgs = toStoredMoneyKgs(toMoneyDecimal(input.storedHeaderTotalKgs));
  if (!shouldTransferBranchPurchaseAtCost(input.branchType)) {
    return {
      skipped: true,
      oldHeaderTotalKgs,
      newHeaderTotalKgs: oldHeaderTotalKgs,
      linePatches: [],
    };
  }

  const linePatches: HqBranchStoredFifoLinePatch[] = [];
  for (const item of input.items) {
    const qty = Math.max(Number(item.approvedQuantity ?? item.quantity ?? 0), 0);
    if (qty <= 0) continue;
    const fifoSnapshotKgs = toStoredMoneyKgs(toMoneyDecimal(item.estimatedLineProductCostKgs));
    const newLineKgs = calculateBprLineTotalKgs(
      {
        quantity: Number(item.quantity ?? 0),
        approvedQuantity: item.approvedQuantity,
        lineStatus: item.lineStatus,
        resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
        wholesalePriceKgs: item.wholesalePriceKgs,
        totalAmount: item.totalAmount,
        approvedLineTotalKgs: item.approvedLineTotalKgs,
        estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
        branchType: input.branchType,
      },
      'reviewed',
    );
    const oldLineKgs = toStoredMoneyKgs(toMoneyDecimal(item.totalAmount));
    const displayUnit = deriveDisplayUnitCost(fifoSnapshotKgs > 0 ? fifoSnapshotKgs : newLineKgs, qty);
    const unitTimesQtyKgs = roundDisplayMoney(displayUnit * qty);
    if (Math.abs(oldLineKgs - newLineKgs) > 0.009) {
      linePatches.push({
        itemId: item.id,
        productName: item.productName ?? item.sku ?? item.id,
        sku: item.sku ?? '',
        quantity: qty,
        fifoSnapshotKgs,
        oldLineKgs,
        newLineKgs,
        unitTimesQtyKgs,
        differenceKgs: roundDisplayMoney(oldLineKgs - newLineKgs),
      });
    }
  }

  const newHeaderTotalKgs = calculateBprOrderTotalKgs(
    input.items.map((item) => ({
      quantity: Number(item.quantity ?? 0),
      approvedQuantity: item.approvedQuantity,
      lineStatus: item.lineStatus,
      resolvedBranchPriceKgs: item.resolvedBranchPriceKgs,
      wholesalePriceKgs: item.wholesalePriceKgs,
      totalAmount: item.totalAmount,
      approvedLineTotalKgs: item.approvedLineTotalKgs,
      estimatedLineProductCostKgs: item.estimatedLineProductCostKgs,
      branchType: input.branchType,
    })),
    'reviewed',
  );

  return {
    skipped: false,
    oldHeaderTotalKgs,
    newHeaderTotalKgs,
    linePatches,
  };
}

export function sumHqBranchStoredFifoSnapshots(items: HqBranchStoredFifoRepairLine[]): number {
  return sumDisplayMoneyTotals(
    items.map((item) => toStoredMoneyKgs(toMoneyDecimal(item.estimatedLineProductCostKgs))),
  );
}
