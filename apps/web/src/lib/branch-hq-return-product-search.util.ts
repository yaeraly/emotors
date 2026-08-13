import { rankProducts } from './product-fuzzy-search';

export type BranchHqReturnStockSearchRow = {
  productId: string;
  productName: string;
  productCode: string;
  availableQuantity: number;
};

export function filterBranchHqReturnStockProducts(
  items: BranchHqReturnStockSearchRow[],
  rawQuery: string,
): BranchHqReturnStockSearchRow[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return [...items].sort((left, right) => left.productName.localeCompare(right.productName, 'ru'));
  }

  const searchable = items.map((item) => ({
    id: item.productId,
    name: item.productName,
    sku: item.productCode,
    barcode: undefined,
    category: '',
    productCategory: item.productCode ? { code: item.productCode } : undefined,
  }));

  const rankedIds = rankProducts(
    searchable as unknown as import('@/lib/types').Product[],
    query,
    items.length,
  ).map((product) => product.id);

  const ranked = rankedIds
    .map((id) => items.find((item) => item.productId === id))
    .filter((item): item is BranchHqReturnStockSearchRow => Boolean(item));

  if (ranked.length > 0) {
    return ranked;
  }

  return items.filter((item) => {
    const haystack = `${item.productName} ${item.productCode}`.toLowerCase();
    return haystack.includes(query);
  });
}
