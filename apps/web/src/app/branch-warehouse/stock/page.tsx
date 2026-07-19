'use client';

import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
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

type StockResponse = {
  warehouse: { id: string; name: string; code: string };
  items: StockRow[];
};

export default function BranchWarehouseStockPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<StockResponse | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<StockResponse>('/branch-warehouse/stock')
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!data?.items) return [];
    if (!query) return data.items;
    return data.items.filter(
      (row) =>
        row.productName.toLowerCase().includes(query) ||
        row.productCode.toLowerCase().includes(query) ||
        (row.category ?? '').toLowerCase().includes(query),
    );
  }, [data, search]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchWarehouseOperator.stock')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchWarehouseOperator.stockTitle')}</h2>
          {data?.warehouse ? (
            <p className="mt-1 text-sm text-slate-600">
              {data.warehouse.name} ({data.warehouse.code})
            </p>
          ) : null}
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('common.search')}
            className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2 text-sm"
          />
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
              {rows.map((row) => (
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
                  <td className="px-4 py-3">
                    {t(`branchWarehouseOperator.stockStatus.${row.stockStatus}`)}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    {t('branchWarehouse.noProducts')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
