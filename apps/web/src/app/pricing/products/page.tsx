'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type ProductPricingRow = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  pricingMode: 'AUTO' | 'MANUAL';
  costPriceKgs: number;
  costSource: string;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
};

type EditableProduct = ProductPricingRow & {
  draftMode: 'AUTO' | 'MANUAL';
  draftWholesale: number;
  draftHqWholesale: number;
  draftRetail: number;
  draftMinimum: number;
};

export default function PricingProductsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableProduct[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [products, me] = await Promise.all([
      apiFetch<ProductPricingRow[]>('/pricing/products'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(
      products.map((product) => ({
        ...product,
        draftMode: product.pricingMode,
        draftWholesale: product.wholesalePriceKgs,
        draftHqWholesale: product.hqBranchWholesalePriceKgs,
        draftRetail: product.recommendedRetailPriceKgs,
        draftMinimum: product.minimumSellingPriceKgs,
      })),
    );
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;
    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          pricingMode: row.draftMode,
          wholesalePriceKgs: row.draftWholesale,
          hqBranchWholesalePriceKgs: row.draftHqWholesale,
          recommendedRetailPriceKgs: row.draftRetail,
          minimumSellingPriceKgs: row.draftMinimum,
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

  async function restoreAuto(productId: string) {
    if (!canManage) return;
    setSavingId(productId);
    setError('');
    try {
      await apiFetch(`/pricing/products/${productId}/restore-auto`, { method: 'POST', body: JSON.stringify({}) });
      setSuccess(t('pricing.restoredAuto'));
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
      <p className="text-sm text-slate-500">{t('pricing.costSourceHint')}</p>
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-[1400px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('sales.product')}</th>
              <th className="px-4 py-3">{t('pricing.categoryName')}</th>
              <th className="px-4 py-3">{t('pricing.pricingMode')}</th>
              <th className="px-4 py-3">{t('pricing.costPrice')}</th>
              <th className="px-4 py-3">{t('pricing.wholesalePrice')}</th>
              <th className="px-4 py-3">{t('pricing.hqBranchWholesalePrice')}</th>
              <th className="px-4 py-3">{t('pricing.recommendedRetailPrice')}</th>
              <th className="px-4 py-3">{t('pricing.minimumSellingPrice')}</th>
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
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-slate-500">{row.sku}</p>
                </td>
                <td className="px-4 py-3">{row.categoryName}</td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <select
                      value={row.draftMode}
                      onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftMode: e.target.value as 'AUTO' | 'MANUAL' } : item))}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                    >
                      <option value="AUTO">{t('pricing.modeAuto')}</option>
                      <option value="MANUAL">{t('pricing.modeManual')}</option>
                    </select>
                  ) : (
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.pricingMode === 'AUTO' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                      {row.pricingMode === 'AUTO' ? t('pricing.modeAuto') : t('pricing.modeManual')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{row.costPriceKgs.toFixed(2)}</p>
                  <p className="text-xs text-slate-500">{t('pricing.costSourceFifo')}</p>
                </td>
                <td className="px-4 py-3"><input type="number" disabled={!canManage || row.draftMode === 'AUTO'} value={row.draftWholesale} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftWholesale: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></td>
                <td className="px-4 py-3"><input type="number" disabled={!canManage || row.draftMode === 'AUTO'} value={row.draftHqWholesale} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftHqWholesale: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></td>
                <td className="px-4 py-3"><input type="number" disabled={!canManage || row.draftMode === 'AUTO'} value={row.draftRetail} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftRetail: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></td>
                <td className="px-4 py-3"><input type="number" disabled={!canManage || row.draftMode === 'AUTO'} value={row.draftMinimum} onChange={(e) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, draftMinimum: Number(e.target.value) } : item))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></td>
                <td className="px-4 py-3">{row.wholesaleMarkupPercent.toFixed(2)}%</td>
                <td className="px-4 py-3">{row.hqBranchWholesaleMarkupPercent.toFixed(2)}%</td>
                <td className="px-4 py-3">{row.recommendedRetailMarkupPercent.toFixed(2)}%</td>
                <td className="px-4 py-3">{row.minimumSellingMarkupPercent.toFixed(2)}%</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    {canManage ? (
                      <button type="button" disabled={savingId === row.id} onClick={() => void save(row.id)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-50">
                        {savingId === row.id ? t('common.loading') : t('common.save')}
                      </button>
                    ) : null}
                    {canManage && row.pricingMode === 'MANUAL' ? (
                      <button type="button" disabled={savingId === row.id} onClick={() => void restoreAuto(row.id)} className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-50">
                        {t('pricing.restoreAuto')}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
