'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product } from '@/lib/types';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<Product>(`/inventory/products/${params.id}`)
      .then(setProduct)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load product'),
      );
  }, [params.id]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <Link href="/products" className="text-sm font-semibold text-blue-700">Back to products</Link>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {product ? (
          <>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 md:flex-row">
                {product.photoUrl ? <img src={product.photoUrl} alt="" className="h-40 w-40 rounded-3xl object-cover" /> : <div className="h-40 w-40 rounded-3xl bg-slate-100" />}
                <div className="flex-1">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{product.sku}</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-950">{product.name}</h2>
                  <p className="mt-2 text-slate-500">{product.description}</p>
                  <div className="mt-6 grid gap-4 md:grid-cols-4">
                    <Info label="Category" value={product.category} />
                    <Info label="Warehouse" value={product.warehouse?.name ?? ''} />
                    <Info label="Quantity" value={String(product.quantity)} />
                    <Info label="Low stock" value={product.lowStock ? 'Yes' : 'No'} />
                  </div>
                </div>
              </div>
            </article>

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel title="Cost and pricing">
                <Info label="Yuan price" value={formatYuan(product.purchasePriceYuan)} />
                <Info label="Yuan rate" value={String(product.latestYuanRate)} />
                <Info label="Final cost" value={formatKgs(product.finalCostKgs)} />
                <Info label="Selling price" value={formatKgs(product.sellingPriceKgs)} />
                <Info label="Margin" value={`${formatKgs(product.marginAmount)} (${Number(product.marginPercent).toFixed(2)}%)`} />
              </Panel>
              <Panel title="Price history">
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {product.priceHistory?.length ? product.priceHistory.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                      <p className="font-bold">{formatKgs(item.finalCostKgs)} → {formatKgs(item.sellingPriceKgs)}</p>
                      <p className="text-slate-500">¥{Number(item.purchasePriceYuan).toFixed(2)} · rate {Number(item.yuanRate).toFixed(4)}</p>
                      <p className="text-slate-500">{new Date(item.effectiveFrom).toLocaleDateString()}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No price history.</p>}
                </div>
              </Panel>
              <Panel title="Stock movements">
                <div className="max-h-96 space-y-3 overflow-y-auto">
                  {product.stockMovements?.length ? product.stockMovements.map((movement) => (
                    <div key={movement.id} className="rounded-2xl bg-slate-50 p-4 text-sm">
                      <p className="font-bold">{movement.type} · {movement.quantity}</p>
                      <p className="text-slate-500">{movement.warehouse?.name}</p>
                      <p className="text-slate-500">{new Date(movement.createdAt).toLocaleString()}</p>
                    </div>
                  )) : <p className="text-sm text-slate-500">No movements.</p>}
                </div>
              </Panel>
            </div>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-bold text-slate-950">{title}</h3><div className="mt-4 space-y-3">{children}</div></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><p className="font-bold text-slate-950">{value}</p></div>;
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}

function formatYuan(value: number | string | null | undefined) {
  return `¥${Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}
