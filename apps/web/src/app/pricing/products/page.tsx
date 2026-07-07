'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { deriveMarkupPercent, validateProductPrices } from '@/lib/pricing-table-utils';
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

type StatusFilter = 'ALL' | 'ACTIVE' | 'ARCHIVED';

const GROUP_WHOLESALE = 'bg-emerald-50/60';
const GROUP_HQ = 'bg-sky-50/60';
const GROUP_RETAIL = 'bg-violet-50/60';
const GROUP_MINIMUM = 'bg-amber-50/60';

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

function formatMarkup(value: number) {
  return `${value.toFixed(2)}%`;
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

  function onPriceChange(
    productId: string,
    field: keyof Pick<EditableProduct, 'draftWholesale' | 'draftHqWholesale' | 'draftRetail' | 'draftMinimum'>,
    value: number,
  ) {
    updateRow(productId, (row) =>
      withMarkupsFromPrices({
        ...row,
        draftMode: 'MANUAL',
        [field]: value,
      }),
    );
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;

    const validationKey = validateProductPrices({
      wholesalePriceKgs: row.draftWholesale,
      hqBranchWholesalePriceKgs: row.draftHqWholesale,
      recommendedRetailPriceKgs: row.draftRetail,
      minimumSellingPriceKgs: row.draftMinimum,
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

  const priceInputClass = 'w-[4.25rem] rounded border border-slate-300 px-1 py-0.5 text-xs disabled:bg-slate-50';
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

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1040px] table-fixed divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-[14%] px-2 py-2">{t('pricing.colProduct')}</th>
              <th className="w-[6%] px-1 py-2">{t('pricing.colMode')}</th>
              <th className="w-[6%] px-1 py-2">{t('pricing.colCost')}</th>
              <th className={`w-[5%] px-1 py-2 ${groupHeaderClass} ${GROUP_WHOLESALE}`}>{t('pricing.colWholesaleMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_WHOLESALE}`}>{t('pricing.colWholesalePrice')}</th>
              <th className={`w-[5%] px-1 py-2 ${groupHeaderClass} ${GROUP_HQ}`}>{t('pricing.colHqWholesaleMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_HQ}`}>{t('pricing.colHqWholesalePrice')}</th>
              <th className={`w-[5%] px-1 py-2 ${groupHeaderClass} ${GROUP_RETAIL}`}>{t('pricing.colRetailMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_RETAIL}`}>{t('pricing.colRetailPrice')}</th>
              <th className={`w-[5%] px-1 py-2 ${groupHeaderClass} ${GROUP_MINIMUM}`}>{t('pricing.colMinimumMarkup')}</th>
              <th className={`w-[7%] px-1 py-2 ${GROUP_MINIMUM}`}>{t('pricing.colMinimumPrice')}</th>
              <th className="w-[7%] px-1 py-2">{t('pricing.colActions')}</th>
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
                    <span
                      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        isAuto ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {isAuto ? t('pricing.modeAuto') : t('pricing.modeManual')}
                    </span>
                  </td>
                  <td className="px-1 py-2">
                    <p className="font-semibold text-slate-800">{row.costPriceKgs.toFixed(0)}</p>
                  </td>
                  <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_WHOLESALE}`}>
                    <p className="font-medium text-slate-600">{formatMarkup(row.draftWholesaleMarkup)}</p>
                  </td>
                  <td className={`px-1 py-2 ${GROUP_WHOLESALE}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftWholesale}
                      onChange={(e) => onPriceChange(row.id, 'draftWholesale', Number(e.target.value))}
                      className={priceInputClass}
                    />
                  </td>
                  <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_HQ}`}>
                    <p className="font-medium text-slate-600">{formatMarkup(row.draftHqMarkup)}</p>
                  </td>
                  <td className={`px-1 py-2 ${GROUP_HQ}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftHqWholesale}
                      onChange={(e) => onPriceChange(row.id, 'draftHqWholesale', Number(e.target.value))}
                      className={priceInputClass}
                    />
                  </td>
                  <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_RETAIL}`}>
                    <p className="font-medium text-slate-600">{formatMarkup(row.draftRetailMarkup)}</p>
                  </td>
                  <td className={`px-1 py-2 ${GROUP_RETAIL}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftRetail}
                      onChange={(e) => onPriceChange(row.id, 'draftRetail', Number(e.target.value))}
                      className={priceInputClass}
                    />
                  </td>
                  <td className={`px-1 py-2 ${groupHeaderClass} ${GROUP_MINIMUM}`}>
                    <p className="font-medium text-slate-600">{formatMarkup(row.draftMinimumMarkup)}</p>
                  </td>
                  <td className={`px-1 py-2 ${GROUP_MINIMUM}`}>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!canManage}
                      value={row.draftMinimum}
                      onChange={(e) => onPriceChange(row.id, 'draftMinimum', Number(e.target.value))}
                      className={priceInputClass}
                    />
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
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
