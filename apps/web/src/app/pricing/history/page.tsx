'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import type { Branch, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type HistoryRow = {
  id: string;
  createdAt: string;
  productId: string | null;
  productName: string;
  productSku: string;
  branchId: string | null;
  branchName: string | null;
  oldMarkup: string | null;
  newMarkup: string | null;
  oldPriceKgs: number | null;
  newPriceKgs: number | null;
  changedById: string;
  changedByName: string;
  reason: string | null;
  fieldName: string;
};

type ProductOption = { id: string; name: string; sku: string };

function formatMarkup(value: string | null) {
  if (!value) return '—';
  try {
    const parsed = JSON.parse(value) as Record<string, number>;
    const entries = Object.entries(parsed)
      .map(([key, val]) => `${key}: ${val}%`)
      .join(', ');
    return entries || value;
  } catch {
    return value;
  }
}

export default function PricingHistoryPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string }>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    productId: '',
    branchId: '',
    changedById: '',
    dateFrom: '',
    dateTo: '',
  });

  async function loadHistory() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filters.productId) params.set('productId', filters.productId);
      if (filters.branchId) params.set('branchId', filters.branchId);
      if (filters.changedById) params.set('changedById', filters.changedById);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);
      const query = params.toString();
      const history = await apiFetch<HistoryRow[]>(`/pricing/history${query ? `?${query}` : ''}`);
      setRows(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      apiFetch<ProductOption[]>('/pricing/retail'),
      apiFetch<Branch[]>('/branches'),
      apiFetch<User[]>('/users'),
    ])
      .then(([productRows, branchRows, userRows]) => {
        setProducts(productRows.map((row) => ({ id: row.id, name: row.name, sku: row.sku })));
        setBranches(branchRows);
        setUsers(userRows.map((row) => ({ id: row.id, fullName: row.fullName })));
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [filters.productId, filters.branchId, filters.changedById, filters.dateFrom, filters.dateTo]);

  const uniqueUsers = useMemo(() => {
    const fromHistory = rows.map((row) => ({ id: row.changedById, fullName: row.changedByName }));
    const merged = [...users, ...fromHistory];
    const seen = new Set<string>();
    return merged.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [rows, users]);

  return (
    <>
      <PricingHubNav activeTab="history" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-5">
        <select
          value={filters.productId}
          onChange={(e) => setFilters((current) => ({ ...current, productId: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t('pricing.filterProduct')}</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <select
          value={filters.branchId}
          onChange={(e) => setFilters((current) => ({ ...current, branchId: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t('pricing.filterBranch')}</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select
          value={filters.changedById}
          onChange={(e) => setFilters((current) => ({ ...current, changedById: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t('pricing.filterUser')}</option>
          {uniqueUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.fullName}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colDate')}</th>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colBranch')}</th>
              <th className="px-3 py-2">{t('pricing.colOldMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colNewMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.oldPrice')}</th>
              <th className="px-3 py-2">{t('pricing.newPrice')}</th>
              <th className="px-3 py-2">{t('pricing.changedBy')}</th>
              <th className="px-3 py-2">{t('pricing.reason')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  {t('pricing.emptyHistory')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{row.productName}</p>
                    <p className="text-xs text-slate-500">{row.productSku}</p>
                  </td>
                  <td className="px-3 py-2">{row.branchName ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatMarkup(row.oldMarkup)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{formatMarkup(row.newMarkup)}</td>
                  <td className="px-3 py-2">{row.oldPriceKgs != null ? row.oldPriceKgs.toFixed(0) : '—'}</td>
                  <td className="px-3 py-2">{row.newPriceKgs != null ? row.newPriceKgs.toFixed(0) : '—'}</td>
                  <td className="px-3 py-2">{row.changedByName}</td>
                  <td className="px-3 py-2 text-slate-600">{row.reason ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
