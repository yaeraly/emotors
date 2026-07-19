export const BRANCH_WAREHOUSE_SECTION_BASE = '/branch-warehouse/warehouse';
export const BRANCH_WAREHOUSE_INVENTORY_BASE = '/branch-warehouse/warehouse/inventory';

export function branchWarehouseInventoryPath(suffix = '') {
  if (!suffix) return BRANCH_WAREHOUSE_INVENTORY_BASE;
  return `${BRANCH_WAREHOUSE_INVENTORY_BASE}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}
