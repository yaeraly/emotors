import type { InventoryCountType } from './types';

export function inventoryTypeLabel(type: InventoryCountType, t: (key: string) => string) {
  return t(`inventoryCount.type.${type}`);
}
