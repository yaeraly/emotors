import { formatKgsLocalized } from './money';

export type BranchCatalogCostRow = {
  currentBranchInventoryCost?: number | null;
  branchInventoryCostAvailable?: boolean;
};

export function formatBranchCatalogInventoryCost(product: BranchCatalogCostRow): string {
  if (product.branchInventoryCostAvailable !== true) return '—';
  const cost = product.currentBranchInventoryCost;
  if (cost == null || !Number.isFinite(Number(cost)) || Number(cost) <= 0) return '—';
  return `${formatKgsLocalized(cost)} сом`;
}
