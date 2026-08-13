import { computeDifference, type ChinaReceivingLineItem, type LocalRowState } from '@/lib/china-receiving-draft';

export const ALL_CATEGORIES = '';
export const UNCATEGORIZED_CATEGORY = '__uncategorized__';

export type VerificationFilterStatus = 'all' | 'unchecked' | 'checked' | 'discrepancy';

export type ChinaReceivingFilters = {
  categoryId: string;
  search: string;
  status: VerificationFilterStatus;
};

export function filtersStorageKey(orderId: string) {
  return `emotors_china_receiving_filters_${orderId}`;
}

export function loadStoredFilters(orderId: string): ChinaReceivingFilters | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(filtersStorageKey(orderId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChinaReceivingFilters>;
    return {
      categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : ALL_CATEGORIES,
      search: typeof parsed.search === 'string' ? parsed.search : '',
      status:
        parsed.status === 'unchecked' || parsed.status === 'checked' || parsed.status === 'discrepancy'
          ? parsed.status
          : 'all',
    };
  } catch {
    return null;
  }
}

export function persistFilters(orderId: string, filters: ChinaReceivingFilters) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(filtersStorageKey(orderId), JSON.stringify(filters));
}

export function resolveLineItemCategoryId(item: ChinaReceivingLineItem): string {
  return item.categoryId || UNCATEGORIZED_CATEGORY;
}

export function resolveCategoryName(item: ChinaReceivingLineItem, language: string): string {
  if (language === 'ky') return item.categoryNameKy || item.categoryNameRu || item.categoryNameEn || item.categoryId || '';
  if (language === 'ru') return item.categoryNameRu || item.categoryNameKy || item.categoryNameEn || item.categoryId || '';
  return item.categoryNameEn || item.categoryNameRu || item.categoryNameKy || item.categoryId || '';
}

export function isRowChecked(row: LocalRowState | undefined): boolean {
  return Boolean(row?.serverIsSaved && !row?.isDirty && row?.saveState === 'saved');
}

export function getVerificationStatus(
  item: ChinaReceivingLineItem,
  row: LocalRowState | undefined,
): 'unchecked' | 'checked' | 'discrepancy' {
  const actualRaw = row?.actualQuantity;
  const actualNotEntered = actualRaw === '' || actualRaw == null;
  if (actualNotEntered) return 'unchecked';

  const actual = Number(actualRaw) || 0;
  const damaged = Number(row?.damagedQuantity) || 0;
  const diff = computeDifference(actual, item.expectedQuantity);
  const hasDiscrepancy = diff !== 0 || damaged > 0;
  if (hasDiscrepancy) return 'discrepancy';
  if (isRowChecked(row)) return 'checked';
  return 'unchecked';
}

export function matchesSearch(item: ChinaReceivingLineItem, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const haystack = [item.productName, item.sku, item.barcode ?? ''].join(' ').toLowerCase();
  return haystack.includes(term);
}

export function matchesFilters(
  item: ChinaReceivingLineItem,
  row: LocalRowState | undefined,
  filters: ChinaReceivingFilters,
): boolean {
  if (filters.categoryId && filters.categoryId !== ALL_CATEGORIES) {
    if (resolveLineItemCategoryId(item) !== filters.categoryId) return false;
  }
  if (!matchesSearch(item, filters.search)) return false;
  if (filters.status !== 'all') {
    const status = getVerificationStatus(item, row);
    if (status !== filters.status) return false;
  }
  return true;
}

export function buildCategoryOptions(
  lineItems: ChinaReceivingLineItem[],
  language: string,
  allLabel: string,
  uncategorizedLabel: string,
) {
  const map = new Map<string, string>();
  for (const item of lineItems) {
    const categoryId = resolveLineItemCategoryId(item);
    if (!map.has(categoryId)) {
      const name =
        categoryId === UNCATEGORIZED_CATEGORY
          ? uncategorizedLabel
          : resolveCategoryName(item, language) || uncategorizedLabel;
      map.set(categoryId, name);
    }
  }
  return [
    { value: ALL_CATEGORIES, label: allLabel },
    ...Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1], language === 'ky' ? 'ky' : language === 'ru' ? 'ru' : 'en'))
      .map(([value, label]) => ({ value, label })),
  ];
}
