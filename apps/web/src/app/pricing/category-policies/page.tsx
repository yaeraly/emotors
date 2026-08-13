'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type MaximumPricePolicy = 'DISABLED' | 'WARNING_ONLY' | 'HARD_LIMIT';

type CategoryRow = {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  defaultRetailMaximumPolicy: MaximumPricePolicy;
  defaultWholesaleMaximumPolicy: MaximumPricePolicy;
  defaultRetailMaximumMarkupPercent: number;
  defaultWholesaleMaximumMarkupPercent: number;
  _count?: { products: number };
};

type EditableCategoryRow = CategoryRow & {
  draftRetailPolicy: MaximumPricePolicy;
  draftWholesalePolicy: MaximumPricePolicy;
  draftRetailMarkup: number;
  draftWholesaleMarkup: number;
};

const policyOptions: MaximumPricePolicy[] = ['DISABLED', 'WARNING_ONLY', 'HARD_LIMIT'];

export default function PricingCategoryPoliciesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableCategoryRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [categories, me] = await Promise.all([
      apiFetch<CategoryRow[]>('/pricing/categories'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(
      categories.map((category) => ({
        ...category,
        defaultRetailMaximumMarkupPercent: Number(category.defaultRetailMaximumMarkupPercent ?? 0),
        defaultWholesaleMaximumMarkupPercent: Number(category.defaultWholesaleMaximumMarkupPercent ?? 0),
        draftRetailPolicy: category.defaultRetailMaximumPolicy ?? 'DISABLED',
        draftWholesalePolicy: category.defaultWholesaleMaximumPolicy ?? 'DISABLED',
        draftRetailMarkup: Number(category.defaultRetailMaximumMarkupPercent ?? 0),
        draftWholesaleMarkup: Number(category.defaultWholesaleMaximumMarkupPercent ?? 0),
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
      [row.code, row.nameRu, row.nameEn].join(' ').toLowerCase().includes(query),
    );
  }, [rows, search]);

  function updateRow(categoryId: string, updater: (row: EditableCategoryRow) => EditableCategoryRow) {
    setRows((current) => current.map((row) => (row.id === categoryId ? updater(row) : row)));
  }

  async function save(categoryId: string) {
    const row = rows.find((item) => item.id === categoryId);
    if (!row || !canManage) return;

    setSavingId(categoryId);
    setError('');
    /* toast clear */ void 0;
    try {
      await apiFetch(`/pricing/categories/${categoryId}/maximum-policy`, {
        method: 'PUT',
        body: JSON.stringify({
          defaultRetailMaximumPolicy: row.draftRetailPolicy,
          defaultWholesaleMaximumPolicy: row.draftWholesalePolicy,
          defaultRetailMaximumMarkupPercent: row.draftRetailMarkup,
          defaultWholesaleMaximumMarkupPercent: row.draftWholesaleMarkup,
        }),
      });
      toast.success(t('pricing.categoryPolicySaved'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="category-policies" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.categoryPoliciesHint')}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pricing.searchCategories')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colCategory')}</th>
              <th className="px-3 py-2">{t('pricing.colRetailMaximumPolicy')}</th>
              <th className="px-3 py-2">{t('pricing.colRetailMaxMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colWholesaleMaximumPolicy')}</th>
              <th className="px-3 py-2">{t('pricing.colWholesaleMaxMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  <p className="font-semibold text-slate-900">{row.nameRu || row.nameEn}</p>
                  <p className="text-xs text-slate-500">{row.code}</p>
                </td>
                <td className="px-3 py-2">
                  <select
                    disabled={!canManage}
                    value={row.draftRetailPolicy}
                    onChange={(e) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        draftRetailPolicy: e.target.value as MaximumPricePolicy,
                      }))
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                  >
                    {policyOptions.map((option) => (
                      <option key={option} value={option}>
                        {t(`pricing.maximumPolicy.${option}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!canManage || row.draftRetailPolicy === 'DISABLED'}
                    value={row.draftRetailMarkup}
                    onChange={(e) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        draftRetailMarkup: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    disabled={!canManage}
                    value={row.draftWholesalePolicy}
                    onChange={(e) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        draftWholesalePolicy: e.target.value as MaximumPricePolicy,
                      }))
                    }
                    className="rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                  >
                    {policyOptions.map((option) => (
                      <option key={option} value={option}>
                        {t(`pricing.maximumPolicy.${option}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    disabled={!canManage || row.draftWholesalePolicy === 'DISABLED'}
                    value={row.draftWholesaleMarkup}
                    onChange={(e) =>
                      updateRow(row.id, (current) => ({
                        ...current,
                        draftWholesaleMarkup: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50"
                  />
                </td>
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
