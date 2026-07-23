'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { PriceExplanationButton } from '@/components/pricing/PriceExplanationButton';
import { apiFetch } from '@/lib/api';
import { applyHqBranchWholesaleMarkup } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type BranchOption = { id: string; name: string; code?: string; branchType: string };

type FranchiseSalesRow = {
  id: string;
  name: string;
  sku: string;
  categoryId?: string;
  categoryName: string;
  hqAvailableQuantity?: number;
  costPriceKgs: number | null;
  costAvailable?: boolean;
  markupConfigured?: boolean;
  hqMarkupPercent: number;
  minimumMarkupPercent?: number | null;
  recommendedMarkupPercent?: number | null;
  maximumMarkupPercent?: number | null;
  minimumBranchPriceKgs?: number | null;
  recommendedBranchPriceKgs?: number | null;
  maximumBranchPriceKgs?: number | null;
  branchPriceKgs: number;
  masterBranchPriceKgs: number;
  effectiveBranchPriceKgs: number;
  ruleApplied: boolean;
  appliedRuleType?: string | null;
  pricingProfileName?: string | null;
  displayBranchId?: string | null;
  displayBranchName?: string | null;
  lastUpdated: string;
};

type EditableFranchiseRow = FranchiseSalesRow & {
  draftMarkup: number;
  previewMasterPriceKgs: number | null;
  isDirty: boolean;
};

function formatPrice(value: number) {
  return Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function isCostAvailable(row: Pick<FranchiseSalesRow, 'costAvailable' | 'costPriceKgs'>) {
  if (row.costAvailable === false) return false;
  if (row.costPriceKgs == null) return false;
  return Number(row.costPriceKgs) > 0;
}

function isMarkupConfigured(row: Pick<FranchiseSalesRow, 'markupConfigured' | 'hqMarkupPercent' | 'recommendedMarkupPercent'>) {
  if (row.markupConfigured === false) return false;
  if (row.recommendedMarkupPercent != null && Number(row.recommendedMarkupPercent) > 0) return true;
  return Number(row.hqMarkupPercent) > 0;
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
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const canManage = canManagePricingPolicy(user);

  async function load(selectedBranchId?: string) {
    setLoading(true);
    setError('');
    try {
      const query = selectedBranchId ? `?branchId=${encodeURIComponent(selectedBranchId)}` : '';
      const [products, me, branchRows] = await Promise.all([
        apiFetch<FranchiseSalesRow[]>(`/pricing/franchise-sales${query}`),
        apiFetch<User>('/auth/me'),
        apiFetch<BranchOption[]>('/branches'),
      ]);
      setUser(me);
      const nonHq = branchRows.filter((b) => b.branchType !== 'HQ_BRANCH');
      setBranches(nonHq);
      const nextBranchId =
        selectedBranchId ||
        products[0]?.displayBranchId ||
        nonHq[0]?.id ||
        '';
      setBranchId(nextBranchId);
      const categoryNames = Array.from(
        new Set(products.map((p) => p.categoryName).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, 'ru'));
      setCategories(categoryNames);
      setRows(
        products.map((product) => ({
          ...product,
          costAvailable: isCostAvailable(product),
          markupConfigured: isMarkupConfigured(product),
          masterBranchPriceKgs: product.masterBranchPriceKgs ?? product.branchPriceKgs,
          effectiveBranchPriceKgs: product.effectiveBranchPriceKgs ?? product.branchPriceKgs,
          ruleApplied: Boolean(product.ruleApplied),
          draftMarkup: product.hqMarkupPercent,
          previewMasterPriceKgs: null,
          isDirty: false,
        })),
      );
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load().catch((err) => {
      setLoading(false);
      setError(err instanceof Error ? err.message : t('common.error'));
    });
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

  function updateRow(productId: string, draftMarkup: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const previewMasterPriceKgs = isCostAvailable(row)
          ? applyHqBranchWholesaleMarkup(Number(row.costPriceKgs), draftMarkup)
          : null;
        return {
          ...row,
          draftMarkup,
          previewMasterPriceKgs,
          isDirty: draftMarkup !== row.hqMarkupPercent,
        };
      }),
    );
  }

  async function save(productId: string) {
    const row = rows.find((item) => item.id === productId);
    if (!row || !canManage) return;
    if (!isCostAvailable(row)) {
      setError(t('pricing.validationCostRequired'));
      return;
    }

    setSavingId(productId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/franchise-sales/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ hqBranchWholesaleMarkupPercent: row.draftMarkup }),
      });
      setSuccess(t('pricing.franchiseSaved'));
      await load(branchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingId(null);
    }
  }

  function renderMoney(value: number | null | undefined, ok: boolean) {
    if (!ok || value == null || Number(value) <= 0) return '—';
    return formatPrice(Number(value));
  }

  function renderMarkup(value: number | null | undefined, configured: boolean) {
    if (!configured || value == null || Number(value) <= 0) return t('pricing.markupNotConfigured');
    return `${Number(value)}%`;
  }

  return (
    <>
      <PricingHubNav activeTab="branches" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
      {!canManage ? <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p> : null}

      <p className="text-xs text-slate-500">{t('pricing.franchiseSalesHint')}</p>
      <p className="text-xs text-slate-500">{t('pricing.catalogEngineHint')}</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">
          {t('pricing.displayBranch')}
          <select
            value={branchId}
            onChange={(e) => {
              const next = e.target.value;
              setBranchId(next);
              void load(next).catch((err) =>
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
        <table className="w-full min-w-[1400px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colCategory')}</th>
              <th className="px-3 py-2">{t('pricing.colHqQty')}</th>
              <th className="px-3 py-2">{t('pricing.colCost')}</th>
              <th className="px-3 py-2">{t('pricing.colMinMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colMinimumPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colRecommendedMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colRecommendedPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colMaxMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colMaxWholesalePrice')}</th>
              <th className="px-3 py-2">{t('pricing.colEffectivePrice')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                  {t('common.loading')}
                </td>
              </tr>
            ) : null}
            {!loading && filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                  {t('pricing.productsNotFound')}
                </td>
              </tr>
            ) : null}
            {!loading
              ? pagedRows.map((row) => {
                  const costOk = isCostAvailable(row);
                  const markupOk = isMarkupConfigured(row);
                  const recommendedShown = row.isDirty
                    ? (row.previewMasterPriceKgs ?? row.recommendedBranchPriceKgs ?? row.masterBranchPriceKgs)
                    : (row.recommendedBranchPriceKgs ?? row.masterBranchPriceKgs);
                  const effectiveShown = row.isDirty
                    ? (row.previewMasterPriceKgs ?? row.effectiveBranchPriceKgs)
                    : row.effectiveBranchPriceKgs;
                  const showBadge = !row.isDirty && row.ruleApplied && costOk;

                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.sku}</p>
                        {row.pricingProfileName ? (
                          <p className="text-[11px] text-slate-400">{row.pricingProfileName}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{row.categoryName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.hqAvailableQuantity ?? 0}</td>
                      <td
                        className="px-3 py-2 font-medium text-slate-800"
                        title={costOk ? undefined : t('pricing.noCalculatedCost')}
                      >
                        {costOk ? formatPrice(Number(row.costPriceKgs)) : t('pricing.noCalculatedCost')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {renderMarkup(row.minimumMarkupPercent, markupOk)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {renderMoney(row.minimumBranchPriceKgs, costOk && markupOk)}
                      </td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.draftMarkup}
                            onChange={(e) => updateRow(row.id, Number(e.target.value))}
                            disabled={!costOk}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                          />
                        ) : (
                          <span>{renderMarkup(row.recommendedMarkupPercent ?? row.hqMarkupPercent, markupOk)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-600">
                        {renderMoney(recommendedShown, costOk)}
                        {row.isDirty && costOk ? (
                          <span className="ml-1 text-[10px] text-amber-600">{t('pricing.previewOnly')}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {renderMarkup(row.maximumMarkupPercent, markupOk)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {renderMoney(row.maximumBranchPriceKgs, costOk && markupOk)}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        <span className="inline-flex items-center gap-1">
                          {renderMoney(effectiveShown, costOk)}
                          {showBadge ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              {t('pricing.ruleAppliedBadge')}
                            </span>
                          ) : null}
                          {costOk && branchId ? (
                            <PriceExplanationButton
                              productId={row.id}
                              branchId={branchId}
                              priceType="BRANCH_PURCHASE"
                            />
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <button
                            type="button"
                            disabled={savingId === row.id || !row.isDirty || !costOk}
                            onClick={() => void save(row.id)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                          >
                            {savingId === row.id ? '…' : t('common.save')}
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
