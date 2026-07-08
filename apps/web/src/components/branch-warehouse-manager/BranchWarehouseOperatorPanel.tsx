'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type BranchWarehouseSummary = {
  id: string;
  name: string;
  code: string;
  branchName?: string | null;
  totalSkuCount: number;
  totalProductQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
};

type StockRow = {
  id: string;
  sku: string;
  product: { name: string };
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
};

type PendingOrder = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
};

export function BranchWarehouseOperatorPanel() {
  const { t } = useTranslation();
  const [warehouse, setWarehouse] = useState<BranchWarehouseSummary | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [warehouses, orders] = await Promise.all([
          apiFetch<BranchWarehouseSummary[]>('/branch-warehouses'),
          apiFetch<PendingOrder[]>('/distribution/orders?status=SHIPPED'),
        ]);
        const branchWarehouse = warehouses[0];
        if (!branchWarehouse) {
          setWarehouse(null);
          setStock([]);
          setPendingOrders(orders);
          return;
        }
        setWarehouse(branchWarehouse);
        const inventory = await apiFetch<StockRow[]>(`/branch-warehouses/${branchWarehouse.id}/inventory`);
        setStock(inventory);
        setPendingOrders(orders);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('common.error'));
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [t]);

  if (loading) {
    return <p className="text-slate-500">{t('common.loading')}</p>;
  }

  if (!warehouse) {
    return (
      <p className="rounded-2xl bg-slate-50 p-6 text-center text-slate-500">
        {t('branchWarehouse.title')}
      </p>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('nav.inventory')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">
            {warehouse.branchName ?? warehouse.name}
          </h2>
          <p className="mt-2 text-slate-500">
            {warehouse.name} · {warehouse.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventory/count/new"
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            {t('inventoryCount.newInventory')}
          </Link>
          <Link
            href="/distribution/orders?status=SHIPPED"
            className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
          >
            {t('distribution.receiveGoods')}
          </Link>
          <Link
            href="/stock-movements"
            className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700"
          >
            {t('inventory.stockMovements')}
          </Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t('branchWarehouse.skuCount')} value={String(warehouse.totalSkuCount)} />
        <SummaryCard label={t('hqWarehouse.totalStock')} value={String(warehouse.totalProductQuantity)} />
        <SummaryCard label={t('branchWarehouse.reserved')} value={String(warehouse.reservedQuantity)} />
        <SummaryCard label={t('branchWarehouse.available')} value={String(warehouse.availableQuantity)} />
      </div>

      {pendingOrders.length > 0 ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-amber-900">{t('distribution.receiveGoods')}</h3>
          <p className="mt-1 text-sm text-amber-800">{t('distribution.receiveGoods')}</p>
          <div className="mt-4 space-y-2">
            {pendingOrders.map((order) => (
              <Link
                key={order.id}
                href={`/distribution/orders/${order.id}`}
                className="flex items-center justify-between rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:border-blue-300"
              >
                <span>{order.orderNumber}</span>
                <span className="text-blue-600">{t('common.open')}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('inventory.products')}</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">{t('hqWarehouse.quantity')}</th>
              <th className="px-4 py-3">{t('hqWarehouse.reserved')}</th>
              <th className="px-4 py-3">{t('hqWarehouse.available')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {stock.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {t('inventoryCount.noHistory')}
                </td>
              </tr>
            ) : (
              stock.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.product.name}</td>
                  <td className="px-4 py-3 text-slate-700">{row.sku}</td>
                  <td className="px-4 py-3 text-slate-700">{row.quantity}</td>
                  <td className="px-4 py-3 text-slate-700">{row.reservedQuantity}</td>
                  <td className="px-4 py-3 text-slate-700">{row.availableQuantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
