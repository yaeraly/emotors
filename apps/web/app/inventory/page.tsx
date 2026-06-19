'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '../../components/protected-shell';
import { Card, PageHeader } from '../../components/ui';
import { apiFetch } from '../../lib/api';

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  finalCostKgs: string;
  sellingPriceKgs: string;
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    category: '',
    purchasePriceYuan: 0,
    latestYuanRate: 0,
    transportCostKgs: 0,
    sellingPriceKgs: 0,
  });

  const load = async () => setProducts(await apiFetch<Product[]>('/inventory/products'));

  useEffect(() => {
    load();
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await apiFetch('/inventory/products', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm({
      name: '',
      sku: '',
      category: '',
      purchasePriceYuan: 0,
      latestYuanRate: 0,
      transportCostKgs: 0,
      sellingPriceKgs: 0,
    });
    await load();
  };

  return (
    <ProtectedShell>
      <PageHeader
        title="Inventory"
        description="Product catalog, warehouse stock, balances, value, and alerts."
      />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="p-5">
          <h3 className="font-black text-slate-950">Create Product</h3>
          <form onSubmit={submit} className="mt-4 space-y-3">
            {(['name', 'sku', 'category'] as const).map((field) => (
              <input
                key={field}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                placeholder={field}
                value={form[field]}
                onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                required
              />
            ))}
            {(
              [
                'purchasePriceYuan',
                'latestYuanRate',
                'transportCostKgs',
                'sellingPriceKgs',
              ] as const
            ).map((field) => (
              <input
                key={field}
                className="w-full rounded-xl border border-slate-300 px-4 py-3"
                type="number"
                min={0}
                placeholder={field}
                value={form[field]}
                onChange={(event) =>
                  setForm({ ...form, [field]: Number(event.target.value) })
                }
              />
            ))}
            <button className="w-full rounded-xl bg-brand-600 px-4 py-3 font-bold text-white">
              Save Product
            </button>
          </form>
        </Card>
        <Card className="overflow-hidden">
          {products.map((product) => (
            <div key={product.id} className="border-b border-slate-100 p-5">
              <p className="font-black text-slate-950">
                {product.name} · {product.sku}
              </p>
              <p className="text-sm text-slate-500">
                {product.category} · Cost {product.finalCostKgs} · Sell{' '}
                {product.sellingPriceKgs}
              </p>
            </div>
          ))}
          {products.length === 0 ? (
            <p className="p-8 text-center text-slate-500">No products yet.</p>
          ) : null}
        </Card>
      </div>
    </ProtectedShell>
  );
}
