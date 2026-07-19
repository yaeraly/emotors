'use client';

import { useEffect, useMemo, useState } from 'react';
import { WarehouseSummaryCard } from '@/components/warehouse/WarehouseSummaryCard';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type StockRow = {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  category: string | null;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
  lastReceiptDate: string | null;
  minStockLevel: number;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
};

type WarehouseSummary = {
  warehouse: { id: string; name: string; code: string };
  skuCount: number;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
};

type StockResponse = {
  warehouse: { id: string; name: string; code: string };
  items: StockRow[];
};

type StockStatusFilter = 'ALL' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HAS_RESERVATION';

export function BranchWarehouseStockContent() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<WarehouseSummary | null>(null);
  const [data, setData] = useState<StockResponse | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<WarehouseSummary>('/branch-warehouse/warehouse/summary'),
      apiFetch<StockResponse>('/branch-warehouse/stock'),
    ])
      .then(([summaryResult, stockResult]) => {
        setSummary(summaryResult);
        setData(stockResult);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [t]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const row of data?.items ?? []) {
      if (row.category) values.add(row.category);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.items ?? []).filter((row) => {
      if (category !== 'ALL' && row.category !== category) return false;
      if (stockStatus === 'IN_STOCK' && row.stockStatus !== 'IN_STOCK') return false;
      if (stockStatus === 'OUT_OF_STOCK' && row.stockStatus !== 'OUT_OF_STOCK') return false;
      if (stockStatus === 'LOW_STOCK' && row.stockStatus !== 'LOW_STOCK') return false;
      if (stockStatus === 'HAS_RESERVATION' && row.reservedQuantity <= 0) return false;
      if (!query) return true;
      return (
        row.productName.toLowerCase().includes(query) ||
        row.productCode.toLowerCase().includes(query) ||
        (row.category ?? '').toLowerCase().includes(query)
      );
    });
  }, [category, data, search, stockStatus]);

  const warehouse = summary?.warehouse ?? data?.warehouse;

  return (
    <div className="space-y-6">
      {warehouse ? (
        <p className="text-sm text-slate-600">
          {warehouse.name} ({warehouse.code})
        </p>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:px-3 sm:py-2.5">
              <div className="h-3 w-16 rounded bg-slate-200" />
              <div className="mt-2 h-6 w-12 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:gap-3">
          <WarehouseSummaryCard compact label={t('hqWarehouse.totalProducts')} value={String(summary.skuCount)} />
          <WarehouseSummaryCard compact label={t('hqWarehouse.totalStock')} value={String(summary.totalQuantity)} />
          <WarehouseSummaryCard compact label={t('branchWarehouse.totalReserved')} value={String(summary.reservedQuantity)} />
          <WarehouseSummaryCard compact label={t('branchWarehouse.totalAvailable')} value={String(summary.availableQuantity)} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('common.search')}
          className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
        >
          <option value="ALL">{t('inventory.allCategories')}</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          value={stockStatus}
          onChange={(event) => setStockStatus(event.target.value as StockStatusFilter)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
        >
          <option value="ALL">{t('branchWarehouseOperator.stockStatusFilter.all')}</option>
          <option value="IN_STOCK">{t('branchWarehouseOperator.stockStatus.IN_STOCK')}</option>
          <option value="OUT_OF_STOCK">{t('branchWarehouseOperator.stockStatus.OUT_OF_STOCK')}</option>
          <option value="LOW_STOCK">{t('branchWarehouseOperator.stockStatus.LOW_STOCK')}</option>
          <option value="HAS_RESERVATION">{t('branchWarehouseOperator.stockStatusFilter.hasReservation')}</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('sales.product')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.productCode')}</th>
              <th className="px-4 py-3">{t('inventory.category')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.onHand')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.reserved')}</th>
              <th className="px-4 py-3">{t('branchWarehouse.available')}</th>
              <th className="px-4 py-3">{t('inventory.unit')}</th>
              <th className="px-4 py-3">{t('branchWarehouseOperator.lastReceipt')}</th>
              <th className="px-4 py-3">{t('branchWarehouseOperator.stockStatus')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-3">
                        <div className="h-4 rounded bg-slate-100" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.productName}</td>
                    <td className="px-4 py-3">{row.productCode}</td>
                    <td className="px-4 py-3">{row.category ?? '—'}</td>
                    <td className="px-4 py-3">{row.quantityOnHand}</td>
                    <td className="px-4 py-3">{row.reservedQuantity}</td>
                    <td className="px-4 py-3">{row.availableQuantity}</td>
                    <td className="px-4 py-3">{row.unit}</td>
                    <td className="px-4 py-3">
                      {row.lastReceiptDate ? new Date(row.lastReceiptDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">{t(`branchWarehouseOperator.stockStatus.${row.stockStatus}`)}</td>
                  </tr>
                ))}
            {!loading && !rows.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  {data?.items.length ? t('branchWarehouseOperator.noFilterResults') : t('branchWarehouseOperator.emptyStock')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
