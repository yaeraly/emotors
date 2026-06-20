'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { InventoryBalance, ProductListResponse, StockValueReport } from '@/lib/types';

export default function InventoryPage() {
  const [stockValue, setStockValue] = useState<StockValueReport | null>(null);
  const [lowStock, setLowStock] = useState<InventoryBalance[]>([]);
  const [products, setProducts] = useState<ProductListResponse | null>(null);
  const [error, setError] = useState('');
  const [yuanRate, setYuanRate] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<StockValueReport>('/inventory/stock-value'),
      apiFetch<InventoryBalance[]>('/inventory/low-stock'),
      apiFetch<ProductListResponse>('/inventory/products?pageSize=1'),
    ])
      .then(([stockValueResult, lowStockResult, productsResult]) => {
        setStockValue(stockValueResult);
        setLowStock(lowStockResult);
        setProducts(productsResult);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load inventory'),
      );
  }, []);

  async function createYuanRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    try {
      await apiFetch('/inventory/yuan-rates', {
        method: 'POST',
        body: JSON.stringify({ rate: Number(yuanRate) }),
      });
      setYuanRate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create yuan rate');
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              Inventory
            </p>
            <h2 className="text-3xl font-bold text-slate-950">
              Stock dashboard
            </h2>
            <p className="mt-2 text-slate-500">
              Spare parts, warehouses, stock value, and low-stock alerts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" href="/products/new">
              New product
            </Link>
            <Link className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700" href="/products">
              Products
            </Link>
            <Link className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700" href="/warehouses">
              Warehouses
            </Link>
            <Link className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700" href="/stock-movements">
              Stock movement
            </Link>
          </div>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card label="Total products" value={String(products?.total ?? 0)} />
          <Card label="Total stock value" value={formatKgs(stockValue?.totalStockValueKgs)} />
          <Card label="Low stock count" value={String(lowStock.length)} />
          <Card label="Total quantity" value={String(stockValue?.totalQuantity ?? 0)} />
        </div>

        <div className="grid gap-6 xl:grid-cols-3">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1">
            <h3 className="text-lg font-bold text-slate-950">Low stock alerts</h3>
            <div className="mt-4 space-y-3">
              {lowStock.length === 0 ? (
                <p className="text-sm text-slate-500">No low-stock products.</p>
              ) : (
                lowStock.map((item) => (
                  <Link
                    key={item.id}
                    href={`/products/${item.productId}`}
                    className="block rounded-2xl border border-red-100 bg-red-50 p-4 text-sm"
                  >
                    <p className="font-bold text-red-800">{item.product.name}</p>
                    <p className="text-red-700">
                      {item.sku} · Qty {item.quantity} / Min {item.minStockLevel}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>

          <Breakdown title="Stock value by warehouse" items={stockValue?.byWarehouse ?? []} />
          <Breakdown title="Stock value by category" items={stockValue?.byCategory ?? []} />
        </div>

        <form onSubmit={createYuanRate} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-sm font-semibold text-slate-700">New Yuan rate</span>
            <input
              value={yuanRate}
              onChange={(event) => setYuanRate(event.target.value)}
              type="number"
              min="0"
              step="0.0001"
              required
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <button className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white" type="submit">
            Save rate
          </button>
        </form>
      </section>
    </ProtectedShell>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; quantity: number; totalStockValueKgs: number }>;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">No stock value yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.name} className="rounded-2xl bg-slate-50 p-4 text-sm">
              <p className="font-bold text-slate-950">{item.name}</p>
              <p className="text-slate-600">
                Qty {item.quantity} · {formatKgs(item.totalStockValueKgs)}
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} сом`;
}
