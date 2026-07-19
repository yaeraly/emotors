import type { StockStatusFilter } from '@/components/warehouse/WarehouseStockToolbar';
import { paginateRows, sortWarehouseRows, type SortDirection, uniqueSortedValues } from '@/lib/warehouse-list-utils';

export type StockRow = {
  id: string;
  sku: string;
  product: { name: string };
  categoryName?: string | null;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minStockLevel?: number;
  stockStatus?: string;
  totalValueKgs?: number;
  lastMovementAt?: string | null;
  status?: string;
};

export type StockFilters = {
  search: string;
  category: string;
  stockStatus: StockStatusFilter;
};

export function filterStockRows(items: StockRow[], filters: StockFilters): StockRow[] {
  const query = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.category && (item.categoryName ?? '') !== filters.category) return false;
    if (filters.stockStatus === 'low' && item.stockStatus !== 'LOW_STOCK') return false;
    if (filters.stockStatus === 'out' && item.stockStatus !== 'OUT_OF_STOCK') return false;
    if (!query) return true;

    const haystack = [item.product.name, item.sku, item.categoryName].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function sortStockRows(items: StockRow[], sortKey: string, direction: SortDirection) {
  return sortWarehouseRows(items, sortKey, direction, {
    product: (row) => row.product.name,
    sku: (row) => row.sku,
    categoryName: (row) => row.categoryName ?? '',
    quantity: (row) => row.quantity,
    reservedQuantity: (row) => row.reservedQuantity,
    availableQuantity: (row) => row.availableQuantity,
    totalValueKgs: (row) => row.totalValueKgs ?? 0,
    lastMovementAt: (row) => row.lastMovementAt ?? '',
    status: (row) => row.status ?? '',
  });
}

export { paginateRows, uniqueSortedValues };
