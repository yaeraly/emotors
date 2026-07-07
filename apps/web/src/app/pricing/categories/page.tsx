'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type CategoryRow = {
  id: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
};

type EditableCategory = CategoryRow & {
  draftWholesale: number;
  draftHqWholesale: number;
  draftRetail: number;
  draftMinimum: number;
};

export default function PricingCategoriesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableCategory[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

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
        draftWholesale: Number(category.wholesaleMarkupPercent),
        draftHqWholesale: Number(category.hqBranchWholesaleMarkupPercent),
        draftRetail: Number(category.recommendedRetailMarkupPercent),
        draftMinimum: Number(category.minimumSellingMarkupPercent),
      })),
    );
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function save(categoryId: string) {
    const row = rows.find((item) => item.id === categoryId);
    if (!row || !canManage) return;
    setSavingId(categoryId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/categories/${categoryId}/markup`, {
        method: 'PUT',
        body: JSON.stringify({
          wholesaleMarkupPercent: row.draftWholesale,
          hqBranchWholesaleMarkupPercent: row.draftHqWholesale,
          recommendedRetailMarkupPercent: row.draftRetail,
          minimumSellingMarkupPercent: row.draftMinimum,
        }),
      });
      setSuccess(t('pricing.categorySaved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('pricing.categoryName')}</th>
              <th className="px-4 py-3">{t('pricing.wholesaleMarkup')}</th>
              <th className="px-4 py-3">{t('pricing.hqWholesaleMarkup')}</th>
              <th className="px-4 py-3">{t('pricing.retailMarkup')}</th>
              <th className="px-4 py-3">{t('pricing.minimumMarkup')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-semibold">{row.nameRu}</td>
                <td className="px-4 py-3">
                  <input type="number" disabled={!canManage} value={row.draftWholesale} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftWholesale: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" />
                </td>
                <td className="px-4 py-3">
                  <input type="number" disabled={!canManage} value={row.draftHqWholesale} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftHqWholesale: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" />
                </td>
                <td className="px-4 py-3">
                  <input type="number" disabled={!canManage} value={row.draftRetail} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftRetail: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" />
                </td>
                <td className="px-4 py-3">
                  <input type="number" disabled={!canManage} value={row.draftMinimum} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftMinimum: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" />
                </td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <button type="button" disabled={savingId === row.id} onClick={() => void save(row.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50">
                      {savingId === row.id ? t('common.loading') : t('common.save')}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{t('pricing.readOnly')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
