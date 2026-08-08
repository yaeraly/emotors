'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import {
  hasFranchiseSalesActiveMarkup,
  isFranchiseSalesCostAvailable,
  normalizeFranchiseSalesCatalogResponse,
  resolveFranchiseSalesDisplayedBranchPriceKgs,
  type FranchiseSalesCatalogListResponse,
  type FranchiseSalesCatalogRow,
} from '@/lib/franchise-sales-catalog';
import { applyHqBranchWholesaleMarkup } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type BranchOption = { id: string; name: string; code?: string; branchType: string };

type FranchiseSalesRow = FranchiseSalesCatalogRow;

type EditableFranchiseRow = FranchiseSalesRow & {
  draftMarkup: number;
  isDirty: boolean;
};

const BRANCH_SELECTION_KEY = 'pricingFranchiseSalesBranchId';

function formatPrice(value: number) {
  return `${Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} сом`;
}

function isCostAvailable(row: Pick<FranchiseSalesRow, 'costAvailable' | 'costPriceKgs'>) {
  return isFranchiseSalesCostAvailable(row);
}

function hasActiveMarkup(markupPercent: number) {
  return hasFranchiseSalesActiveMarkup(markupPercent);
}

function savedMarkupPercent(row: Pick<FranchiseSalesRow, 'baseFranchiseMarkupPercent' | 'hqMarkupPercent'>) {
  const candidates = [row.baseFranchiseMarkupPercent, row.hqMarkupPercent];
  for (const value of candidates) {
    if (value == null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function resolveDraftMarkupFromProduct(product: FranchiseSalesRow) {
  const candidates = [
    product.baseFranchiseMarkupPercent,
    product.hqMarkupPercent,
    product.recommendedMarkupPercent,
  ];
  for (const value of candidates) {
    if (value == null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function resolveDisplayedBranchPriceKgs(row: FranchiseSalesRow) {
  return resolveFranchiseSalesDisplayedBranchPriceKgs(row);
}

function resolveBranchPriceKgs(row: EditableFranchiseRow) {
  if (!isCostAvailable(row)) return null;
  if (!hasActiveMarkup(row.draftMarkup)) return null;
  return applyHqBranchWholesaleMarkup(Number(row.costPriceKgs), row.draftMarkup);
}

export default function PricingBranchesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableFranchiseRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [branchId, setBranchId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const canManage = canManagePricingPolicy(user);

  async function loadProducts(selectedBranchId: string) {
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const query = `?branchId=${encodeURIComponent(selectedBranchId)}`;
      const payload = await apiFetch<FranchiseSalesCatalogListResponse | FranchiseSalesRow[]>(
        `/pricing/franchise-sales${query}`,
      );
      const catalog = normalizeFranchiseSalesCatalogResponse(payload);
      const products = catalog.items;
      const categoryNames = Array.from(
        new Set(products.map((p) => p.categoryName).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, 'ru'));
      setCategories(categoryNames);
      setWarning(catalog.warning ?? '');
      setRows(
        products.map((product) => {
          const displayedPrice = resolveDisplayedBranchPriceKgs(product);
          const draftMarkup = resolveDraftMarkupFromProduct(product);
          return {
            ...product,
            costAvailable: isCostAvailable(product),
            branchPriceKgs: displayedPrice,
            finalBranchPriceKgs: displayedPrice,
            masterBranchPriceKgs: displayedPrice,
            priceConfigured: product.priceConfigured ?? Boolean(displayedPrice),
            markupConfigured: product.markupConfigured ?? hasActiveMarkup(draftMarkup),
            configurationStatus:
              product.configurationStatus ??
              (product.priceConfigured || hasActiveMarkup(draftMarkup)
                ? 'CONFIGURED'
                : 'NOT_CONFIGURED'),
            draftMarkup,
            isDirty: false,
          };
        }),
      );
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
      setWarning('');
      setRows([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }

  async function initialize() {
    setLoading(true);
    setError('');
    try {
      const [me, branchRows] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<BranchOption[]>('/branches'),
      ]);
      setUser(me);
      const nonHq = branchRows.filter((b) => b.branchType !== 'HQ_BRANCH');
      setBranches(nonHq);

      const persistedBranchId = window.sessionStorage.getItem(BRANCH_SELECTION_KEY);
      const nextBranchId =
        (persistedBranchId && nonHq.some((branch) => branch.id === persistedBranchId)
          ? persistedBranchId
          : null) ||
        nonHq[0]?.id ||
        '';
      setBranchId(nextBranchId);

      if (nextBranchId) {
        await loadProducts(nextBranchId);
      } else {
        setRows([]);
        setCategories([]);
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void initialize();
  }, [t]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter && row.categoryName !== categoryFilter) return false;
      if (!query) return true;
      return [row.name, row.sku, row.categoryName].join(' ').toLowerCase().includes(query);
    });
  }, [rows, search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

  function updateRow(productId: string, draftMarkup: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const saved = savedMarkupPercent(row);
        return {
          ...row,
          draftMarkup,
          isDirty: Math.abs(draftMarkup - saved) > 0.001,
        };
      }),
    );
  }

  async function save(productId: string) {
    if (savingId === productId) return;

    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;
    if (!isCostAvailable(row)) {
      setError(t('pricing.validationCostRequired'));
      return;
    }
    if (!hasActiveMarkup(row.draftMarkup)) {
      setError(t('pricing.validationMarkupNegative'));
      return;
    }

    const savedMarkup = row.draftMarkup;
    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
      const updated = await apiFetch<FranchiseSalesRow>(`/pricing/franchise-sales/${productId}${query}`, {
        method: 'PUT',
        body: JSON.stringify({ hqBranchWholesaleMarkupPercent: savedMarkup }),
      });
      const branchPrice = resolveDisplayedBranchPriceKgs(updated);
      const persistedMarkup = resolveDraftMarkupFromProduct(updated);

      setRows((current) =>
        current.map((item) => {
          if (item.id !== productId) return item;
          return {
            ...item,
            ...updated,
            costAvailable: isCostAvailable(updated),
            hqMarkupPercent: persistedMarkup > 0 ? persistedMarkup : item.hqMarkupPercent,
            baseFranchiseMarkupPercent:
              persistedMarkup > 0 ? persistedMarkup : item.baseFranchiseMarkupPercent,
            recommendedMarkupPercent:
              persistedMarkup > 0 ? persistedMarkup : item.recommendedMarkupPercent,
            markupConfigured: updated.markupConfigured ?? persistedMarkup > 0,
            branchPriceKgs: branchPrice ?? item.branchPriceKgs,
            finalBranchPriceKgs: branchPrice ?? item.finalBranchPriceKgs,
            masterBranchPriceKgs: branchPrice ?? item.masterBranchPriceKgs,
            priceConfigured: updated.priceConfigured ?? Boolean(branchPrice ?? item.branchPriceKgs),
            draftMarkup: persistedMarkup > 0 ? persistedMarkup : savedMarkup,
            isDirty: false,
          };
        }),
      );
      setSuccess(t('pricing.rowSaved'));
      window.sessionStorage.setItem('branchOrderPricingRevision', String(Date.now()));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  function renderMarkupCell(row: EditableFranchiseRow, costOk: boolean) {
    if (canManage && costOk) {
      return (
        <input
          type="number"
          min={0}
          step="0.01"
          value={row.draftMarkup}
          onChange={(e) => updateRow(row.id, Number(e.target.value))}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      );
    }
    if (!hasActiveMarkup(row.draftMarkup)) {
      return t('pricing.markupNotConfiguredShort');
    }
    return `${Number(row.draftMarkup)}%`;
  }

  return (
    <>
      <PricingHubNav activeTab="branches" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {warning ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</p>
      ) : null}
      {success ? (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {success}
        </div>
      ) : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.franchiseSalesHint')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">
          {t('pricing.displayBranch')}
          <select
            value={branchId}
            onChange={(e) => {
              const next = e.target.value;
              setBranchId(next);
              window.sessionStorage.setItem(BRANCH_SELECTION_KEY, next);
              void loadProducts(next).catch((err) =>
                setError(err instanceof Error ? err.message : t('common.error')),
              );
            }}
            className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          {t('pricing.colCategory')}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('pricing.allCategories')}</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder={t('pricing.searchProducts')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colSku')}</th>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colUnitCost')}</th>
              <th className="px-3 py-2">{t('pricing.colMarkupLabel')}</th>
              <th className="px-3 py-2">{t('pricing.colBranchPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : null}
            {!loading && !error && filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  {t('pricing.productsNotFound')}
                </td>
              </tr>
            ) : null}
            {!loading && error && filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  {t('common.error')}
                </td>
              </tr>
            ) : null}
            {!loading
              ? pagedRows.map((row) => {
                  const costOk = isCostAvailable(row);
                  const branchPriceKgs = resolveBranchPriceKgs(row) ?? resolveDisplayedBranchPriceKgs(row);

                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.sku}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                      <td
                        className="px-3 py-2 font-medium text-slate-800"
                        title={costOk ? undefined : t('pricing.noCalculatedCost')}
                      >
                        {costOk ? formatPrice(Number(row.costPriceKgs)) : t('pricing.noCalculatedCost')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{renderMarkupCell(row, costOk)}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {branchPriceKgs != null ? formatPrice(branchPriceKgs) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <button
                            type="button"
                            disabled={savingId === row.id || !row.isDirty || !costOk || !hasActiveMarkup(row.draftMarkup)}
                            onClick={() => void save(row.id)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                          >
                            {savingId === row.id ? t('common.saving') : t('common.save')}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>

      {!loading && filteredRows.length > pageSize ? (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {filteredRows.length} · {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              ←
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
