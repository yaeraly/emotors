export type DistributionOrderItemPickingDisplayRow = {
  pickedAt?: string | null;
};

export function isDistributionOrderItemPickedForDisplay(
  item: DistributionOrderItemPickingDisplayRow,
): boolean {
  return item.pickedAt != null;
}

/**
 * Presentation-only sort for HQ warehouse picking table:
 * unpicked rows first (stable original order), picked rows last (pickedAt ASC).
 */
export function sortDistributionOrderItemsForPickingDisplay<
  T extends DistributionOrderItemPickingDisplayRow,
>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftPicked = isDistributionOrderItemPickedForDisplay(left.item);
      const rightPicked = isDistributionOrderItemPickedForDisplay(right.item);

      if (leftPicked !== rightPicked) {
        return leftPicked ? 1 : -1;
      }

      if (leftPicked && rightPicked) {
        const leftAt = left.item.pickedAt ? Date.parse(left.item.pickedAt) : 0;
        const rightAt = right.item.pickedAt ? Date.parse(right.item.pickedAt) : 0;
        if (leftAt !== rightAt) {
          return leftAt - rightAt;
        }
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}
