'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { Product, ProductListResponse, ProductPurchasePriceHistory } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type Supplier = { id: string; name: string };
type Factory = { id: string; name: string; supplierId: string };
type UserOption = { id: string; fullName: string };

export default function PurchasePriceHistoryReportPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductPurchasePriceHistory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    productId: '',
    supplierId: '',
    factoryId: '',
    changedById: '',
    from: '',
    to: '',
  });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.productId) params.set('productId', filters.productId);
    if (filters.supplierId) params.set('supplierId', filters.supplierId);
    if (filters.factoryId) params.set('factoryId', filters.factoryId);
    if (filters.changedById) params.set('changedById', filters.changedById);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }, [filters]);

  useEffect(() => {
    Promise.all([
      apiFetch<ProductListResponse>('/inventory/products?pageSize=500'),
      apiFetch<Supplier[]>('/procurement/suppliers'),
      apiFetch<Factory[]>('/procurement/factories'),
      apiFetch<UserOption[]>('/users').catch(() => []),
    ])
      .then(([productResult, supplierResult, factoryResult, userResult]) => {
        setProducts(productResult.items);
        setSuppliers(supplierResult);
        setFactories(factoryResult);
        setUsers(userResult);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  useEffect(() => {
    setLoading(true);
    apiFetch<ProductPurchasePriceHistory[]>(`/inventory/purchase-price-history${queryString ? `?${queryString}` : ''}`)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')))
      .finally(() => setLoading(false));
  }, [queryString, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/procurement" className="text-sm font-semibold text-blue-700">{t('procurement.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{t('inventory.purchasePriceReport')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <FilterSelect label={t('procurement.orders.product')} value={filters.productId} onChange={(value) => setFilters({ ...filters, productId: value })}>
              <option value="">-</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
            </FilterSelect>
            <FilterSelect label={t('procurement.orders.supplier')} value={filters.supplierId} onChange={(value) => setFilters({ ...filters, supplierId: value })}>
              <option value="">-</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </FilterSelect>
            <FilterSelect label={t('procurement.orders.factory')} value={filters.factoryId} onChange={(value) => setFilters({ ...filters, factoryId: value })}>
              <option value="">-</option>
              {factories.map((factory) => <option key={factory.id} value={factory.id}>{factory.name}</option>)}
            </FilterSelect>
            <FilterSelect label={t('inventory.changedBy')} value={filters.changedById} onChange={(value) => setFilters({ ...filters, changedById: value })}>
              <option value="">-</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}
            </FilterSelect>
            <FilterInput label={t('inventory.effectiveDate')} type="date" value={filters.from} onChange={(value) => setFilters({ ...filters, from: value })} />
            <FilterInput label={t('inventory.effectiveDate')} type="date" value={filters.to} onChange={(value) => setFilters({ ...filters, to: value })} />
          </div>
        </section>
        <section className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('inventory.effectiveDate')}</th>
                <th className="px-4 py-3">{t('procurement.orders.product')}</th>
                <th className="px-4 py-3">{t('procurement.orders.supplier')}</th>
                <th className="px-4 py-3">{t('procurement.orders.factory')}</th>
                <th className="px-4 py-3">{t('inventory.oldPriceYuan')}</th>
                <th className="px-4 py-3">{t('inventory.newPriceYuan')}</th>
                <th className="px-4 py-3">{t('inventory.priceDifferenceYuan')}</th>
                <th className="px-4 py-3">{t('inventory.purchasePriceChangeReason')}</th>
                <th className="px-4 py-3">{t('inventory.changedBy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>{t('common.loading')}</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{new Date(row.effectiveDate).toLocaleString()}</td>
                  <td className="px-4 py-3">{row.product ? `${row.product.sku} · ${row.product.name}` : '-'}</td>
                  <td className="px-4 py-3">{row.supplier?.name ?? '-'}</td>
                  <td className="px-4 py-3">{row.factory?.name ?? '-'}</td>
                  <td className="px-4 py-3">¥{Number(row.oldPriceYuan).toFixed(2)}</td>
                  <td className="px-4 py-3">¥{Number(row.newPriceYuan).toFixed(2)}</td>
                  <td className={`px-4 py-3 font-semibold ${row.differenceYuan > 0 ? 'text-red-600' : row.differenceYuan < 0 ? 'text-green-600' : ''}`}>
                    {row.differenceYuan > 0
                      ? t('procurement.orders.priceIncreased').replace('{amount}', Number(row.differenceYuan).toFixed(2))
                      : row.differenceYuan < 0
                        ? t('procurement.orders.priceDecreased').replace('{amount}', Number(row.differenceYuan).toFixed(2))
                        : '0'}
                  </td>
                  <td className="px-4 py-3">{t(`inventory.purchasePriceReason.${row.reason}`)}</td>
                  <td className="px-4 py-3">{row.changedBy?.fullName ?? '-'}</td>
                </tr>
              )) : (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={9}>{t('inventory.noPurchasePriceHistory')}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </section>
    </ProtectedShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2">
        {children}
      </select>
    </label>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
    </label>
  );
}
