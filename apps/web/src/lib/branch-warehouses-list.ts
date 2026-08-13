import type { StatusFilter } from '@/lib/warehouse-list-utils';

export type BranchWarehousesListFilters = {
  search: string;
  branchId: string;
  region: string;
  city: string;
  status: StatusFilter;
  page: number;
};

export const EMPTY_BRANCH_WAREHOUSES_LIST_FILTERS: BranchWarehousesListFilters = {
  search: '',
  branchId: '',
  region: '',
  city: '',
  status: 'all',
  page: 1,
};

export function buildBranchWarehousesListQuery(filters: BranchWarehousesListFilters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.branchId) params.set('branchId', filters.branchId);
  if (filters.region) params.set('region', filters.region);
  if (filters.city) params.set('city', filters.city);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.page > 1) params.set('page', String(filters.page));
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function parseBranchWarehousesListFilters(
  searchParams: URLSearchParams,
): BranchWarehousesListFilters {
  const status = searchParams.get('status');
  const parsedStatus: StatusFilter =
    status === 'active' || status === 'inactive' ? status : 'all';
  const page = Number(searchParams.get('page') ?? '1');

  return {
    search: searchParams.get('search') ?? '',
    branchId: searchParams.get('branchId') ?? '',
    region: searchParams.get('region') ?? '',
    city: searchParams.get('city') ?? '',
    status: parsedStatus,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function branchWarehousesListHref(filters: BranchWarehousesListFilters) {
  return `/branch-warehouses${buildBranchWarehousesListQuery(filters)}`;
}
