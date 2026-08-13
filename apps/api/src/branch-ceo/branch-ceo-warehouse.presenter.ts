type StockRowLike = {
  id: string;
  sku: string;
  product: { name: string; minStockLevel?: number };
  categoryName?: string | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  totalValueKgs?: number;
  lastMovementAt?: string | Date | null;
  status?: string;
  averageCostKgs?: number;
  landedCostKgs?: number;
  supplierName?: string | null;
  sellingPriceKgs?: number;
  finalCostKgs?: number;
};

function resolveStockStatus(quantity: number, minStockLevel = 0) {
  if (quantity <= 0) return 'OUT_OF_STOCK';
  if (quantity <= minStockLevel) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function sanitizeBranchCeoStockRow(row: StockRowLike) {
  const minStockLevel = row.product.minStockLevel ?? 0;
  return {
    id: row.id,
    sku: row.sku,
    product: {
      name: row.product.name,
      minStockLevel,
    },
    categoryName: row.categoryName ?? null,
    quantity: row.quantity,
    reservedQuantity: row.reservedQuantity,
    availableQuantity: row.availableQuantity,
    minStockLevel,
    stockStatus: resolveStockStatus(row.quantity, minStockLevel),
    totalValueKgs: row.totalValueKgs ?? 0,
    lastMovementAt: row.lastMovementAt ?? null,
    status: row.status ?? 'ACTIVE',
  };
}
