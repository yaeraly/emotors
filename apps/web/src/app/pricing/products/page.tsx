'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { pricesFromMarkups, validateProductMarkups } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type CategoryOption = {
  id: string;
  nameRu: string;
  nameKy: string;
  nameEn: string;
};

type ProductPricingRow = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  isActive: boolean;
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
  draftWholesaleMarkup: number;
  draftHqMarkup: number;
  draftRetailMarkup: number;
  draftMinimumMarkup: number;
  draftWholesale: number;
  draftHqWholesale: number;
  draftRetail: number;
  draftMinimum: number;
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'ARCHIVED';

const GROUP_WHOLESALE = 'bg-emerald-50/60';
const GROUP_HQ = 'bg-sky-50/60';
const GROUP_RETAIL = 'bg-violet-50/60';
const GROUP_MINIMUM = 'bg-amber-50/60';

function toEditable(product: ProductPricingRow): EditableProduct {
  return {
    ...product,
    draftWholesaleMarkup: product.wholesaleMarkupPercent,
    draftHqMarkup: product.hqBranchWholesaleMarkupPercent,
    draftRetailMarkup: product.recommendedRetailMarkupPercent,
    draftMinimumMarkup: product.minimumSellingMarkupPercent,
    draftWholesale: product.wholesalePriceKgs,
    draftHqWholesale: product.hqBranchWholesalePriceKgs,
    draftRetail: product.recommendedRetailPriceKgs,
    draftMinimum: product.minimumSellingPriceKgs,
  };
}

function withCalculatedPrices(row: EditableProduct): EditableProduct {
  const prices = pricesFromMarkups(row.costPriceKgs, {
    wholesaleMarkupPercent: row.draftWholesaleMarkup,
    hqBranchWholesaleMarkupPercent: row.draftHqMarkup,
    recommendedRetailMarkupPercent: row.draftRetailMarkup,
    minimumSellingMarkupPercent: row.draftMinimumMarkup,
  });
  return {
    ...row,
    draftWholesale: prices.wholesalePriceKgs,
    draftHqWholesale: prices.hqBranchWholesalePriceKgs,
    draftRetail: prices.recommendedRetailPriceKgs,
    draftMinimum: prices.minimumSellingPriceKgs,
  };
}

function formatPrice(value: number) {
  return value.toFixed(0);
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
      if (statusFilter === 'ACTIVE' && !row.isActive) return false;
      if (statusFilter === 'ARCHIVED' && row.isActive) return false;
      if (!query) return true;
      return [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query);
    });
  }, [rows, search, categoryId, statusFilter]);

  function updateRow(productId: string, updater: (row: EditableProduct) => EditableProduct) {
    setRows((current) => current.map((row) => (row.id === productId ? updater(row) : row)));
  }

  function onMarkupChange(
    productId: string,
    field: keyof Pick<EditableProduct, 'draftWholesaleMarkup' | 'draftHqMarkup' | 'draftRetailMarkup' | 'draftMinimumMarkup'>,
    value: number,
  ) {
    updateRow(productId, (row) => withCalculatedPrices({ ...row, [field]: value }));
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;

    const validationKey = validateProductMarkups(row.costPriceKgs, {
      wholesaleMarkupPercent: row.draftWholesaleMarkup,
      hqBranchWholesaleMarkupPercent: row.draftHqMarkup,
      recommendedRetailMarkupPercent: row.draftRetailMarkup,
      minimumSellingMarkupPercent: row.draftMinimumMarkup,
    });
    if (validationKey) {
      setError(t(validationKey));
      setSuccess('');
      return;
    }

    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({
          wholesaleMarkupPercent: row.draftWholesaleMarkup,
          hqBranchWholesaleMarkupPercent: row.draftHqMarkup,
          recommendedRetailMarkupPercent: row.draftRetailMarkup,
          minimumSellingMarkupPercent: row.draftMinimumMarkup,
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

  const markupInputClass = 'w-[3.25rem] rounded border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-50';
  const groupHeaderClass = 'border-l border-slate-200';

  return (
    <>
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-3">
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
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="ALL">{t('pricing.allStatuses')}</option>
          <option value="ACTIVE">{t('pricing.statusActive')}</option>
          <option value="ARCHIVED">{t('pricing.statusArchived')}</option>
        </select>
      </div>

      <p className="text-xs text-slate-500">{t('pricing.markupOnlyHint')}</p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[980px] table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[16%] px-2 py-2">{t('pricing.colProduct')}</th>
              <th className="w-[6%] px-1 py-2">{t('pricing.colCost')}</th>
              <th className={`w-[6%] px-1 py-2 ${groupHeaderClass} ${GROUP_WHOLESALE}`}>{t('pricing.colWholesaleMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_WHOLESALE}`}>{t('pricing.colWholesalePrice')}</th>
              <th className={`w-[6%] px-1 py-2 ${groupHeaderClass} ${GROUP_HQ}`}>{t('pricing.colHqWholesaleMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_HQ}`}>{t('pricing.colHqWholesalePrice')}</th>
              <th className={`w-[6%] px-1 py-2 ${groupHeaderClass} ${GROUP_RETAIL}`}>{t('pricing.colRetailMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_RETAIL}`}>{t('pricing.colRetailPrice')}</th>
              <th className={`w-[6%] px-1 py-2 ${groupHeaderClass} ${GROUP_MINIMUM}`}>{t('pricing.colMinimumMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_MINIMUM}`}>{t('pricing.colMinimumPrice')}</th>
              <th className="w-[7%] px-1 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="px-2 py-2">
                  <p className="truncate font-semibold text-slate-900" title={row.name}>{row.name}</p>
                  <p className="truncate text-[10px] text-slate-500" title={row.sku}>{row.sku}</p>
                </td>
                <td className="px-1 py-2">
                  <p className="font-semibold text-slate-800">{formatPrice(row.costPriceKgs)}</p>
                </td>
                <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_WHOLESALE}`}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canManage}
                    value={row.draftWholesaleMarkup}
                    onChange={(e) => onMarkupChange(row.id, 'draftWholesaleMarkup', Number(e.target.value))}
                    className={markupInputClass}
                  />
                </td>
                <td className={`px-1 py-2 ${GROUP_WHOLESALE}`}>
                  <p className="font-medium text-slate-700">{formatPrice(row.draftWholesale)}</p>
                </td>
                <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_HQ}`}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canManage}
                    value={row.draftHqMarkup}
                    onChange={(e) => onMarkupChange(row.id, 'draftHqMarkup', Number(e.target.value))}
                    className={markupInputClass}
                  />
                </td>
                <td className={`px-1 py-2 ${GROUP_HQ}`}>
                  <p className="font-medium text-slate-700">{formatPrice(row.draftHqWholesale)}</p>
                </td>
                <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_RETAIL}`}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canManage}
                    value={row.draftRetailMarkup}
                    onChange={(e) => onMarkupChange(row.id, 'draftRetailMarkup', Number(e.target.value))}
                    className={markupInputClass}
                  />
                </td>
                <td className={`px-1 py-2 ${GROUP_RETAIL}`}>
                  <p className="font-medium text-slate-700">{formatPrice(row.draftRetail)}</p>
                </td>
                <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_MINIMUM}`}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!canManage}
                    value={row.draftMinimumMarkup}
                    onChange={(e) => onMarkupChange(row.id, 'draftMinimumMarkup', Number(e.target.value))}
                    className={markupInputClass}
                  />
                </td>
                <td className={`px-1 py-2 ${GROUP_MINIMUM}`}>
                  <p className="font-medium text-slate-700">{formatPrice(row.draftMinimum)}</p>
                </td>
                <td className="px-1 py-2">
                  {canManage ? (
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void save(row.id)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50"
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
