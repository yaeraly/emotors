import {
  sortDistributionOrderItemsForPickingDisplay,
  type DistributionOrderItemPickingDisplayRow,
} from '@/lib/distribution-order-picking-display.util';

export type BranchHqReturnPickingDisplayRow = DistributionOrderItemPickingDisplayRow;

/** Reuse distribution picking sort: unpicked first, picked rows last by pickedAt. */
export function sortBranchHqReturnItemsForPickingDisplay<T extends BranchHqReturnPickingDisplayRow>(
  items: T[],
): T[] {
  return sortDistributionOrderItemsForPickingDisplay(items);
}

/** Difference between sent/shipped quantity and received quantity. */
export function computeBranchHqReturnDifferenceQuantity(
  sentQuantity: number,
  receivedQuantity: number,
): number {
  return Number(sentQuantity || 0) - Number(receivedQuantity || 0);
}
