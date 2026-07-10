'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { applyMarkupRoundUp } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type WholesaleRow = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  isActive: boolean;
  costPriceKgs: number;
  branchPurchasePriceKgs: number;
  minimumWholesaleMarkupPercent: number;
  recommendedWholesaleMarkupPercent: number;
  wholesalePriceKgs: number;
  minimumWholesalePriceKgs: number;
  currentPriceKgs: number;
};

type EditableWholesaleRow = WholesaleRow & {
  draftMinMarkup: number;
  draftRecommendedMarkup: number;
  draftWholesalePrice: number;
  draftMinPrice: number;
};

function formatPrice(value: number) {
  return value.toFixed(0);
}

function withCalculatedPrices(row: EditableWholesaleRow): EditableWholesaleRow {
  return {
    ...row,
    draftMinPrice: applyMarkupRoundUp(row.branchPurchasePriceKgs, row.draftMinMarkup),
    draftWholesalePrice: applyMarkupRoundUp(row.branchPurchasePriceKgs, row.draftRecommendedMarkup),
  };
}

function validateWholesaleRange(row: EditableWholesaleRow) {
  if (row.draftMinMarkup > row.draftRecommendedMarkup + 0.01) {
    return 'pricing.validationWholesaleMinRecommended';
  }
  if (row.currentPriceKgs + 0.01 < row.draftMinPrice) {
    return 'pricing.validationCurrentBelowMinWholesale';
  }
  if (row.currentPriceKgs > row.draftWholesalePrice + 0.01) {
    return 'pricing.validationCurrentAboveRecommendedWholesale';
  }
  return null;
}

export default function PricingWholesalePage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableWholesaleRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [products, me] = await Promise.all([
      apiFetch<WholesaleRow[]>('/pricing/wholesale'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(
      products.map((product) =>
        withCalculatedPrices({
          ...product,
          draftMinMarkup: product.minimumWholesaleMarkupPercent,
          draftRecommendedMarkup: product.recommendedWholesaleMarkupPercent,
          draftWholesalePrice: product.wholesalePriceKgs,
          draftMinPrice: product.minimumWholesalePriceKgs,
        }),
      ),
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

  function updateRow(productId: string, updater: (row: EditableWholesaleRow) => EditableWholesaleRow) {
    setRows((current) => current.map((row) => (row.id === productId ? updater(row) : row)));
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;

    const validationKey = validateWholesaleRange(row);
    if (validationKey) {
      setError(t(validationKey));
      return;
    }

    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/wholesale/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          minimumWholesaleMarkupPercent: row.draftMinMarkup,
          recommendedWholesaleMarkupPercent: row.draftRecommendedMarkup,
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

  return (
    <>
      <PricingHubNav activeTab="wholesale" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.wholesaleHint')}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pricing.searchProducts')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colBranchPurchasePrice')}</th>
              <th className="px-3 py-2">{t('pricing.colMinMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colRecommendedMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colWholesalePrice')}</th>
              <th className="px-3 py-2">{t('pricing.colCurrentPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => {
              const rangeError = validateWholesaleRange(row);
              return (
                <tr key={row.id}>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-slate-900">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.sku}</p>
                  </td>
                  <td className="px-3 py-2">{formatPrice(row.branchPurchasePriceKgs)}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftMinMarkup}
                      onChange={(e) =>
                        updateRow(row.id, (current) =>
                          withCalculatedPrices({ ...current, draftMinMarkup: Number(e.target.value) }),
                        )
                      }
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftRecommendedMarkup}
                      onChange={(e) =>
                        updateRow(row.id, (current) =>
                          withCalculatedPrices({
                            ...current,
                            draftRecommendedMarkup: Number(e.target.value),
                          }),
                        )
                      }
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{formatPrice(row.draftWholesalePrice)}</td>
                  <td className="px-3 py-2">
                    <span className={rangeError ? 'font-semibold text-red-600' : 'font-medium text-slate-800'}>
                      {formatPrice(row.currentPriceKgs)}
                    </span>
                    {rangeError ? (
                      <p className="text-[10px] text-red-600">{t(rangeError)}</p>
                    ) : (
                      <p className="text-[10px] text-slate-400">
                        {formatPrice(row.draftMinPrice)} – {formatPrice(row.draftWholesalePrice)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <button
                        type="button"
                        disabled={savingId === row.id || !!rangeError}
                        onClick={() => void save(row.id)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                      >
                        {savingId === row.id ? '…' : t('common.save')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
