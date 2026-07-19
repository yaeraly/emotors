export const BRANCH_CEO_WAREHOUSE_BASE = '/branch-ceo/warehouse';
export const BRANCH_CEO_WAREHOUSE_INVENTORY_BASE = '/branch-ceo/warehouse/inventory';

export function branchCeoWarehouseInventoryPath(suffix = '') {
  if (!suffix) return BRANCH_CEO_WAREHOUSE_INVENTORY_BASE;
  return `${BRANCH_CEO_WAREHOUSE_INVENTORY_BASE}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}
