/**
 * Shared inventory-count discrepancy display rules.
 * Branch Warehouse may see the aggregate total, but never item-level cost columns.
 */
export function shouldShowInventoryCountDiscrepancyTotal(_input?: {
  hideItemFinancials?: boolean;
}) {
  return true;
}

export function shouldShowInventoryCountItemCostColumns(input: {
  hideItemFinancials?: boolean;
}) {
  return !input.hideItemFinancials;
}
