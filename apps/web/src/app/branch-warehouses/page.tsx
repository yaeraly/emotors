'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { WarehouseDataTable } from '@/components/warehouse/WarehouseDataTable';
import { WarehouseListToolbar } from '@/components/warehouse/WarehouseListToolbar';
import { WarehousePagination } from '@/components/warehouse/WarehousePagination';
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard';
import { apiFetch } from '@/lib/api';
import {
  filterWarehouseRows,
  paginateRows,
  sortWarehouseRows,
  type SortDirection,
  type StatusFilter,
  uniqueSortedValues,
} from '@/lib/warehouse-list-utils';
import { useTranslation } from '@/i18n/useTranslation';

const PAGE_SIZE = 10;

type BranchWarehouseMetrics = {
  id: string;
  name: string;
  code: string;
  city?: string | null;
  country?: string | null;
  branchName?: string | null;
  totalSkuCount: number;
  totalProductQuantity: number;
  totalStockValueKgs: number;
  reservedQuantity: number;
  availableQuantity: number;
  lastInventoryDate?: string | null;
  isActive: boolean;
};

export default function BranchWarehousesPage() {
  const { t } = useTranslation();
  const [warehouses, setWarehouses] = useState<BranchWarehouseMetrics[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState('branchName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiFetch<BranchWarehouseMetrics[]>('/branch-warehouses')
      .then((list) =>
        setWarehouses(
          list.map((warehouse) => ({
            ...warehouse,
            country: warehouse.country ?? 'Kyrgyzstan',
          })),
        ),
      )
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const regionOptions = useMemo(
    () => uniqueSortedValues(warehouses.map((warehouse) => warehouse.country ?? 'Kyrgyzstan')),
    [warehouses],
  );
  const cityOptions = useMemo(
    () => uniqueSortedValues(warehouses.map((warehouse) => warehouse.city)),
    [warehouses],
  );

  const filteredWarehouses = useMemo(
    () =>
      sortWarehouseRows(
        filterWarehouseRows(warehouses, { search, region, city, status }),
        sortKey,
        sortDirection,
        {
          branchName: (row) => row.branchName ?? '',
          name: (row) => row.name,
          code: (row) => row.code,
          city: (row) => row.city ?? '',
          totalSkuCount: (row) => row.totalSkuCount,
          totalProductQuantity: (row) => row.totalProductQuantity,
          totalStockValueKgs: (row) => row.totalStockValueKgs,
          reservedQuantity: (row) => row.reservedQuantity,
          availableQuantity: (row) => row.availableQuantity,
          isActive: (row) => (row.isActive ? 1 : 0),
          lastInventoryDate: (row) => row.lastInventoryDate ?? '',
        },
      ),
    [warehouses, search, region, city, status, sortKey, sortDirection],
  );

  const pagination = useMemo(
    () => paginateRows(filteredWarehouses, page, PAGE_SIZE),
    [filteredWarehouses, page],
  );

  const summary = useMemo(
    () => ({
      totalBranchWarehouses: filteredWarehouses.length,
      totalSku: filteredWarehouses.reduce((sum, row) => sum + row.totalSkuCount, 0),
      totalQuantity: filteredWarehouses.reduce((sum, row) => sum + row.totalProductQuantity, 0),
      totalInventoryValueKgs: filteredWarehouses.reduce((sum, row) => sum + row.totalStockValueKgs, 0),
      totalReserved: filteredWarehouses.reduce((sum, row) => sum + row.reservedQuantity, 0),
      totalAvailable: filteredWarehouses.reduce((sum, row) => sum + row.availableQuantity, 0),
    }),
    [filteredWarehouses],
  );

  function handleSort(nextKey: string) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('asc');
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchWarehouse.title')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('branchWarehouse.title')}</h2>
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <WarehouseSummaryCard label={t('branchWarehouse.totalWarehouses')} value={String(summary.totalBranchWarehouses)} />
          <WarehouseSummaryCard label={t('branchWarehouse.skuCount')} value={String(summary.totalSku)} />
          <WarehouseSummaryCard label={t('hqWarehouse.totalStock')} value={String(summary.totalQuantity)} />
          <WarehouseSummaryCard label={t('hqWarehouse.totalValue')} value={`${summary.totalInventoryValueKgs.toLocaleString()} KGS`} />
          <WarehouseSummaryCard label={t('branchWarehouse.totalReserved')} value={String(summary.totalReserved)} />
          <WarehouseSummaryCard label={t('branchWarehouse.totalAvailable')} value={String(summary.totalAvailable)} />
        </div>

        <WarehouseListToolbar
          search={search}
          region={region}
          city={city}
          status={status}
          regionOptions={regionOptions}
          cityOptions={cityOptions}
          searchPlaceholder={t('warehouse.searchBranchPlaceholder')}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onRegionChange={(value) => {
            setRegion(value);
            setPage(1);
          }}
          onCityChange={(value) => {
            setCity(value);
            setPage(1);
          }}
          onStatusChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />

        <WarehouseDataTable
          columns={[
            {
              key: 'branchName',
              label: t('branchWarehouse.branchName'),
              sortable: true,
              render: (row) => <span className="font-semibold text-slate-900">{row.branchName ?? '—'}</span>,
            },
            {
              key: 'name',
              label: t('warehouse.name'),
              sortable: true,
              render: (row) => <span className="font-bold">{row.name}</span>,
            },
            {
              key: 'code',
              label: t('warehouse.code'),
              sortable: true,
              render: (row) => row.code,
            },
            {
              key: 'city',
              label: t('hqWarehouse.city'),
              sortable: true,
              render: (row) => row.city ?? '—',
            },
            {
              key: 'totalSkuCount',
              label: t('branchWarehouse.skuCount'),
              sortable: true,
              render: (row) => row.totalSkuCount,
            },
            {
              key: 'totalProductQuantity',
              label: t('hqWarehouse.totalStock'),
              sortable: true,
              render: (row) => row.totalProductQuantity,
            },
            {
              key: 'totalStockValueKgs',
              label: t('hqWarehouse.totalValue'),
              sortable: true,
              render: (row) => `${row.totalStockValueKgs.toLocaleString()} KGS`,
            },
            {
              key: 'isActive',
              label: t('common.status'),
              sortable: true,
              render: (row) => (row.isActive ? t('warehouse.active') : t('warehouse.inactive')),
            },
            {
              key: 'lastInventoryDate',
              label: t('branchWarehouse.lastInventory'),
              sortable: true,
              render: (row) =>
                row.lastInventoryDate ? new Date(row.lastInventoryDate).toLocaleDateString() : '—',
            },
            {
              key: 'actions',
              label: t('common.actions'),
              render: (row) => (
                <Link
                  href={`/branch-warehouses/${row.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  {t('common.open')}
                </Link>
              ),
            },
          ]}
          rows={pagination.items}
          rowKey={(row) => row.id}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={handleSort}
          emptyLabel={t('warehouse.list')}
        />

        <WarehousePagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </section>
    </ProtectedShell>
  );
}
