'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { applyHqBranchWholesaleMarkup } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type FranchiseSalesRow = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  costPriceKgs: number;
  hqMarkupPercent: number;
  branchPriceKgs: number;
  lastUpdated: string;
};

type EditableFranchiseRow = FranchiseSalesRow & {
  draftMarkup: number;
};

function formatPrice(value: number) {
  return value.toFixed(0);
}

export default function PricingBranchesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableFranchiseRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [products, me] = await Promise.all([
      apiFetch<FranchiseSalesRow[]>('/pricing/franchise-sales'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(
      products.map((product) => ({
        ...product,
        draftMarkup: product.hqMarkupPercent,
      })),
    );
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query),
    );
  }, [rows, search]);

  function updateRow(productId: string, draftMarkup: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const branchPriceKgs = applyHqBranchWholesaleMarkup(row.costPriceKgs, draftMarkup);
        return { ...row, draftMarkup, branchPriceKgs };
      }),
    );
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;

    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/franchise-sales/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ hqBranchWholesaleMarkupPercent: row.draftMarkup }),
      });
      setSuccess(t('pricing.franchiseSaved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="branches" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.franchiseSalesHint')}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pricing.searchProducts')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colCategory')}</th>
              <th className="px-3 py-2">{t('pricing.colCost')}</th>
              <th className="px-3 py-2">{t('pricing.colHqMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colBranchPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colLastUpdated')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <p className="font-semibold text-slate-900">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.sku}</p>
                </td>
                <td className="px-3 py-2 text-slate-700">{row.categoryName}</td>
                <td className="px-3 py-2 font-medium text-slate-800">{formatPrice(row.costPriceKgs)}</td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.draftMarkup}
                      onChange={(e) => updateRow(row.id, Number(e.target.value))}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span>{row.hqMarkupPercent}%</span>
                  )}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">{formatPrice(row.branchPriceKgs)}</td>
                <td className="px-3 py-2 text-slate-600">{new Date(row.lastUpdated).toLocaleString()}</td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void save(row.id)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                    >
                      {savingId === row.id ? '…' : t('common.save')}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
