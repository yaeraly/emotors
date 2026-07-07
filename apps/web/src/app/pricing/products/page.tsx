'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { applyMarkup, deriveMarkupPercent } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type CategoryOption = {
  id: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
  wholesaleMarkupPercent: number;
  hqBranchWholesaleMarkupPercent: number;
  recommendedRetailMarkupPercent: number;
  minimumSellingMarkupPercent: number;
};

type ProductPricingRow = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
  pricingMode: 'AUTO' | 'MANUAL';
  costPriceKgs: number;
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
  draftWholesaleMarkup: number;
  draftHqMarkup: number;
  draftRetailMarkup: number;
  draftMinimumMarkup: number;
};

type ModeFilter = 'ALL' | 'AUTO' | 'MANUAL';
type StatusFilter = 'ALL' | 'ACTIVE' | 'ARCHIVED';

function toEditable(product: ProductPricingRow): EditableProduct {
  return {
    ...product,
    draftMode: product.pricingMode,
    draftWholesale: product.wholesalePriceKgs,
    draftHqWholesale: product.hqBranchWholesalePriceKgs,
    draftRetail: product.recommendedRetailPriceKgs,
    draftMinimum: product.minimumSellingPriceKgs,
    draftWholesaleMarkup: product.wholesaleMarkupPercent,
    draftHqMarkup: product.hqBranchWholesaleMarkupPercent,
    draftRetailMarkup: product.recommendedRetailMarkupPercent,
    draftMinimumMarkup: product.minimumSellingMarkupPercent,
  };
}

function withPricesFromMarkups(row: EditableProduct): EditableProduct {
  const cost = row.costPriceKgs;
  return {
    ...row,
    draftWholesale: applyMarkup(cost, row.draftWholesaleMarkup),
    draftHqWholesale: applyMarkup(cost, row.draftHqMarkup),
    draftRetail: applyMarkup(cost, row.draftRetailMarkup),
    draftMinimum: applyMarkup(cost, row.draftMinimumMarkup),
  };
}

function withMarkupsFromPrices(row: EditableProduct): EditableProduct {
  const cost = row.costPriceKgs;
  return {
    ...row,
    draftWholesaleMarkup: deriveMarkupPercent(cost, row.draftWholesale),
    draftHqMarkup: deriveMarkupPercent(cost, row.draftHqWholesale),
    draftRetailMarkup: deriveMarkupPercent(cost, row.draftRetail),
    draftMinimumMarkup: deriveMarkupPercent(cost, row.draftMinimum),
  };
}

export default function PricingProductsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [products, categoryList, me] = await Promise.all([
      apiFetch<ProductPricingRow[]>('/pricing/products'),
      apiFetch<CategoryOption[]>('/pricing/categories'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setCategories(categoryList);
    setRows(products.map(toEditable));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryId && row.categoryId !== categoryId) return false;
      if (modeFilter !== 'ALL' && row.draftMode !== modeFilter) return false;
      if (statusFilter === 'ACTIVE' && !row.isActive) return false;
      if (statusFilter === 'ARCHIVED' && row.isActive) return false;
      if (!query) return true;
      return [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query);
    });
  }, [rows, search, categoryId, modeFilter, statusFilter]);

  function updateRow(productId: string, updater: (row: EditableProduct) => EditableProduct) {
    setRows((current) => current.map((row) => (row.id === productId ? updater(row) : row)));
  }

  function onModeChange(productId: string, mode: 'AUTO' | 'MANUAL') {
    updateRow(productId, (row) => {
      if (mode === 'AUTO') {
        const category = categories.find((item) => item.id === row.categoryId);
        if (category) {
          return withPricesFromMarkups({
            ...row,
            draftMode: 'AUTO',
            draftWholesaleMarkup: category.wholesaleMarkupPercent,
            draftHqMarkup: category.hqBranchWholesaleMarkupPercent,
            draftRetailMarkup: category.recommendedRetailMarkupPercent,
            draftMinimumMarkup: category.minimumSellingMarkupPercent,
          });
        }
      }
      return { ...row, draftMode: mode };
    });
  }

  function onMarkupChange(productId: string, field: keyof Pick<EditableProduct, 'draftWholesaleMarkup' | 'draftHqMarkup' | 'draftRetailMarkup' | 'draftMinimumMarkup'>, value: number) {
    updateRow(productId, (row) => withPricesFromMarkups({ ...row, [field]: value }));
  }

  function onPriceChange(productId: string, field: keyof Pick<EditableProduct, 'draftWholesale' | 'draftHqWholesale' | 'draftRetail' | 'draftMinimum'>, value: number) {
    updateRow(productId, (row) => {
      const next = withMarkupsFromPrices({ ...row, draftMode: 'MANUAL', [field]: value });
      return next;
    });
  }

  function markupsMatchCategory(row: EditableProduct) {
    const category = categories.find((item) => item.id === row.categoryId);
    if (!category) return true;
    return (
      row.draftWholesaleMarkup === category.wholesaleMarkupPercent &&
      row.draftHqMarkup === category.hqBranchWholesaleMarkupPercent &&
      row.draftRetailMarkup === category.recommendedRetailMarkupPercent &&
      row.draftMinimumMarkup === category.minimumSellingMarkupPercent
    );
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;
    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      const payload =
        row.draftMode === 'AUTO' && markupsMatchCategory(row)
          ? { pricingMode: 'AUTO' as const }
          : row.draftMode === 'AUTO'
            ? {
                pricingMode: 'MANUAL' as const,
                wholesaleMarkupPercent: row.draftWholesaleMarkup,
                hqBranchWholesaleMarkupPercent: row.draftHqMarkup,
                recommendedRetailMarkupPercent: row.draftRetailMarkup,
                minimumSellingMarkupPercent: row.draftMinimumMarkup,
              }
            : {
                pricingMode: 'MANUAL' as const,
                wholesalePriceKgs: row.draftWholesale,
                hqBranchWholesalePriceKgs: row.draftHqWholesale,
                recommendedRetailPriceKgs: row.draftRetail,
                minimumSellingPriceKgs: row.draftMinimum,
              };
      await apiFetch(`/pricing/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
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

  const inputClass = 'w-[4.5rem] rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:bg-slate-50';
  const markupInputClass = 'w-[3.5rem] rounded border border-slate-300 px-1.5 py-0.5 text-xs disabled:bg-slate-50';

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-4 xl:grid-cols-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('pricing.searchProducts')}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">{t('pricing.allCategories')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.nameRu}</option>
          ))}
        </select>
        <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value as ModeFilter)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="ALL">{t('pricing.allModes')}</option>
          <option value="AUTO">{t('pricing.modeAuto')}</option>
          <option value="MANUAL">{t('pricing.modeManual')}</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="ALL">{t('pricing.allStatuses')}</option>
          <option value="ACTIVE">{t('pricing.statusActive')}</option>
          <option value="ARCHIVED">{t('pricing.statusArchived')}</option>
        </select>
      </div>

      <p className="text-xs text-slate-500">{t('pricing.costSourceHint')}</p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1080px] table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[14%] px-2 py-2">{t('pricing.colProduct')}</th>
              <th className="w-[6%] px-1 py-2">{t('pricing.colMode')}</th>
              <th className="w-[6%] px-1 py-2">{t('pricing.colCost')}</th>
              <th className="w-[7%] px-1 py-2">{t('pricing.colWholesale')}</th>
              <th className="w-[7%] px-1 py-2">{t('pricing.colHqWholesale')}</th>
              <th className="w-[7%] px-1 py-2">{t('pricing.colRetail')}</th>
              <th className="w-[7%] px-1 py-2">{t('pricing.colMinimum')}</th>
              <th className="w-[5%] px-1 py-2">{t('pricing.colWholesaleMarkup')}</th>
              <th className="w-[5%] px-1 py-2">{t('pricing.colHqMarkup')}</th>
              <th className="w-[5%] px-1 py-2">{t('pricing.colRetailMarkup')}</th>
              <th className="w-[5%] px-1 py-2">{t('pricing.colMinimumMarkup')}</th>
              <th className="w-[8%] px-1 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => {
              const isAuto = row.draftMode === 'AUTO';
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-2 py-2">
                    <p className="truncate font-semibold text-slate-900" title={row.name}>{row.name}</p>
                    <p className="truncate text-[10px] text-slate-500" title={row.sku}>{row.sku}</p>
                  </td>
                  <td className="px-1 py-2">
                    {canManage ? (
                      <select value={row.draftMode} onChange={(e) => onModeChange(row.id, e.target.value as 'AUTO' | 'MANUAL')} className="w-full rounded border border-slate-300 px-1 py-0.5 text-[10px] font-semibold">
                        <option value="AUTO">{t('pricing.modeAuto')}</option>
                        <option value="MANUAL">{t('pricing.modeManual')}</option>
                      </select>
                    ) : (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${isAuto ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {isAuto ? t('pricing.modeAuto') : t('pricing.modeManual')}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2">
                    <p className="font-semibold">{row.costPriceKgs.toFixed(0)}</p>
                    <p className="text-[10px] leading-tight text-slate-400">{t('pricing.colCostHint')}</p>
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" disabled={!canManage || isAuto} value={row.draftWholesale} onChange={(e) => onPriceChange(row.id, 'draftWholesale', Number(e.target.value))} className={inputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" disabled={!canManage || isAuto} value={row.draftHqWholesale} onChange={(e) => onPriceChange(row.id, 'draftHqWholesale', Number(e.target.value))} className={inputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" disabled={!canManage || isAuto} value={row.draftRetail} onChange={(e) => onPriceChange(row.id, 'draftRetail', Number(e.target.value))} className={inputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" disabled={!canManage || isAuto} value={row.draftMinimum} onChange={(e) => onPriceChange(row.id, 'draftMinimum', Number(e.target.value))} className={inputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" step="0.1" disabled={!canManage || !isAuto} value={row.draftWholesaleMarkup} onChange={(e) => onMarkupChange(row.id, 'draftWholesaleMarkup', Number(e.target.value))} className={markupInputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" step="0.1" disabled={!canManage || !isAuto} value={row.draftHqMarkup} onChange={(e) => onMarkupChange(row.id, 'draftHqMarkup', Number(e.target.value))} className={markupInputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" step="0.1" disabled={!canManage || !isAuto} value={row.draftRetailMarkup} onChange={(e) => onMarkupChange(row.id, 'draftRetailMarkup', Number(e.target.value))} className={markupInputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <input type="number" step="0.1" disabled={!canManage || !isAuto} value={row.draftMinimumMarkup} onChange={(e) => onMarkupChange(row.id, 'draftMinimumMarkup', Number(e.target.value))} className={markupInputClass} />
                  </td>
                  <td className="px-1 py-2">
                    <div className="flex flex-col gap-1">
                      {canManage ? (
                        <button type="button" disabled={savingId === row.id} onClick={() => void save(row.id)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50">
                          {savingId === row.id ? '…' : t('common.save')}
                        </button>
                      ) : null}
                      {canManage && row.pricingMode === 'MANUAL' ? (
                        <button type="button" disabled={savingId === row.id} onClick={() => void restoreAuto(row.id)} className="rounded border border-emerald-300 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 disabled:opacity-50">
                          {t('pricing.restoreAutoShort')}
                        </button>
                      ) : null}
                    </div>
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
