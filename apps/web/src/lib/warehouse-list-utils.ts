export type StatusFilter = 'all' | 'active' | 'inactive';

export type WarehouseListFilters = {
  search: string;
  region: string;
  city: string;
  status: StatusFilter;
};

export type SortDirection = 'asc' | 'desc';

export function filterWarehouseRows<
  T extends {
    name: string;
    code: string;
    city?: string | null;
    country?: string | null;
    branchName?: string | null;
    isActive: boolean;
  },
>(items: T[], filters: WarehouseListFilters): T[] {
  const query = filters.search.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.status === 'active' && !item.isActive) return false;
    if (filters.status === 'inactive' && item.isActive) return false;
    if (filters.region && (item.country ?? 'Kyrgyzstan') !== filters.region) return false;
    if (filters.city && (item.city ?? '') !== filters.city) return false;
    if (!query) return true;

    const haystack = [item.branchName, item.name, item.code, item.city]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function sortWarehouseRows<T>(
  items: T[],
  sortKey: string,
  direction: SortDirection,
  getters: Record<string, (item: T) => string | number | null | undefined>,
): T[] {
  const getter = getters[sortKey];
  if (!getter) return items;

  return [...items].sort((left, right) => {
    const leftValue = getter(left);
    const rightValue = getter(right);

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return direction === 'asc' ? leftValue - rightValue : rightValue - leftValue;
    }

    const leftText = String(leftValue ?? '');
    const rightText = String(rightValue ?? '');
    return direction === 'asc'
      ? leftText.localeCompare(rightText)
      : rightText.localeCompare(leftText);
  });
}

export function paginateRows<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    total: items.length,
  };
}

export function uniqueSortedValues(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b),
  );
}
