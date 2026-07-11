'use client';

import { useEffect, useMemo, useState } from 'react';
import { MaximumMarkupOverrideModal } from '@/components/pricing/MaximumMarkupOverrideModal';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type RetailRow = {
  id: string;
  productId: string;
  name: string;
  sku: string;
  categoryName: string;
  effectiveBranchPriceKgs: number;
  minimumRetailMarkupPercent: number;
  minimumRetailPriceKgs: number;
  recommendedRetailMarkupPercent: number;
  recommendedRetailPriceKgs: number;
  inheritedMaximumRetailMarkupPercent: number;
  maximumRetailMarkupOverridePercent: number | null;
  effectiveMaximumRetailMarkupPercent: number;
  maximumRetailPriceKgs: number;
  maximumRetailMarkupSource: 'INHERITED' | 'CEO_PRODUCT_OVERRIDE';
  validationStatus: 'OK' | 'ERROR';
  validationErrors: string[];
  lastUpdated: string | null;
};

type EditableRetailRow = RetailRow & {
  draftMinMarkup: number;
  draftRecommendedMarkup: number;
};

function formatPrice(value: number) {
  return value.toFixed(0);
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function PricingRetailPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableRetailRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [overrideRow, setOverrideRow] = useState<RetailRow | null>(null);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [products, me] = await Promise.all([
      apiFetch<RetailRow[]>('/pricing/retail'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(
      products.map((product) => ({
        ...product,
        draftMinMarkup: product.minimumRetailMarkupPercent,
        draftRecommendedMarkup: product.recommendedRetailMarkupPercent,
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

  function updateRow(productId: string, updater: (row: EditableRetailRow) => EditableRetailRow) {
    setRows((current) => current.map((row) => (row.id === productId ? updater(row) : row)));
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;

    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/retail/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          minimumSellingMarkupPercent: row.draftMinMarkup,
          recommendedRetailMarkupPercent: row.draftRecommendedMarkup,
        }),
      });
      setSuccess(t('pricing.productSaved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  async function restoreInheritance(productId: string) {
    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/retail/${productId}/maximum-markup-override`, { method: 'DELETE' });
      setSuccess(t('pricing.inheritanceRestored'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="retail" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.retailHint')}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pricing.searchProducts')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1280px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colCategory')}</th>
              <th className="px-3 py-2">{t('pricing.colBranchPurchasePrice')}</th>
              <th className="px-3 py-2">{t('pricing.colMinMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colMinimumPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colRecommendedMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colRecommendedPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colMaxMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colMaxRetailPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colMaximumMarkupSource')}</th>
              <th className="px-3 py-2">{t('pricing.colLastUpdated')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => {
              const hasError = row.validationStatus === 'ERROR';
              return (
                <tr key={row.id} className={hasError ? 'bg-red-50/60' : undefined}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.sku}</p>
                  </td>
                  <td className="px-3 py-2">{row.categoryName}</td>
                  <td className="px-3 py-2">{formatPrice(row.effectiveBranchPriceKgs)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftMinMarkup}
                      onChange={(e) =>
                        updateRow(row.id, (current) => ({
                          ...current,
                          draftMinMarkup: Number(e.target.value),
                        }))
                      }
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-3 py-2">{formatPrice(row.minimumRetailPriceKgs)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftRecommendedMarkup}
                      onChange={(e) =>
                        updateRow(row.id, (current) => ({
                          ...current,
                          draftRecommendedMarkup: Number(e.target.value),
                        }))
                      }
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-3 py-2">{formatPrice(row.recommendedRetailPriceKgs)}</td>
                  <td className="px-3 py-2 font-medium">
                    {row.effectiveMaximumRetailMarkupPercent.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 font-medium">{formatPrice(row.maximumRetailPriceKgs)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        row.maximumRetailMarkupSource === 'CEO_PRODUCT_OVERRIDE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.maximumRetailMarkupSource === 'CEO_PRODUCT_OVERRIDE'
                        ? t('pricing.maximumMarkupSourceCeo')
                        : t('pricing.maximumMarkupSourceInherited')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{formatDate(row.lastUpdated)}</td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() => void save(row.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                        >
                          {savingId === row.id ? '…' : t('common.save')}
                        </button>
                        {row.maximumRetailMarkupSource === 'INHERITED' ? (
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            onClick={() => setOverrideRow(row)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 disabled:opacity-50"
                          >
                            {t('pricing.changeMaximumMarkup')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={savingId === row.id}
                            onClick={() => void restoreInheritance(row.id)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                          >
                            {t('pricing.restoreInheritedMaximum')}
                          </button>
                        )}
                      </div>
                    ) : null}
                    {hasError ? (
                      <p className="mt-1 text-[10px] text-red-600">{row.validationErrors[0]}</p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MaximumMarkupOverrideModal
        open={overrideRow != null}
        title={t('pricing.changeMaximumMarkup')}
        inheritedMaximumMarkupPercent={overrideRow?.inheritedMaximumRetailMarkupPercent ?? 0}
        currentOverridePercent={overrideRow?.maximumRetailMarkupOverridePercent ?? null}
        onClose={() => setOverrideRow(null)}
        onSubmit={async (payload) => {
          if (!overrideRow) return;
          await apiFetch(`/pricing/retail/${overrideRow.id}/maximum-markup-override`, {
            method: 'PUT',
            body: JSON.stringify({
              maximumRetailMarkupOverridePercent: payload.overridePercent,
              overrideReasonCode: payload.overrideReasonCode,
              overrideReasonComment: payload.overrideReasonComment,
            }),
          });
          setSuccess(t('pricing.maximumMarkupOverridden'));
          await load();
        }}
      />
    </>
  );
}
