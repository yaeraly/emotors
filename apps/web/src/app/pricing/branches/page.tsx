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
  categoryName: string;
  costPriceKgs: number;
  costAvailable?: boolean;
  hqMarkupPercent: number;
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

/** Existing pricing money formatter — supports decimals; never shows batch totals as integers by truncation alone. */
function formatPrice(value: number) {
  return Number(value).toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function isCostAvailable(row: Pick<FranchiseSalesRow, 'costAvailable' | 'costPriceKgs'>) {
  if (row.costAvailable === false) return false;
  return Number(row.costPriceKgs) > 0;
}

export default function PricingBranchesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableFranchiseRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [branchId, setBranchId] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canManage = canManagePricingPolicy(user);

  async function load(selectedBranchId?: string) {
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
    setRows(
      products.map((product) => ({
        ...product,
        costAvailable: isCostAvailable(product),
        masterBranchPriceKgs: product.masterBranchPriceKgs ?? product.branchPriceKgs,
        effectiveBranchPriceKgs: product.effectiveBranchPriceKgs ?? product.branchPriceKgs,
        ruleApplied: Boolean(product.ruleApplied),
        draftMarkup: product.hqMarkupPercent,
        previewMasterPriceKgs: null,
        isDirty: false,
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

  function updateRow(productId: string, draftMarkup: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== productId) return row;
        const previewMasterPriceKgs = isCostAvailable(row)
          ? applyHqBranchWholesaleMarkup(row.costPriceKgs, draftMarkup)
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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('pricing.searchProducts')}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colProduct')}</th>
              <th className="px-3 py-2">{t('pricing.colCategory')}</th>
              <th className="px-3 py-2">{t('pricing.colCost')}</th>
              <th className="px-3 py-2">{t('pricing.colHqMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colMasterPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colEffectivePrice')}</th>
              <th className="px-3 py-2">{t('pricing.colLastUpdated')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => {
              const costOk = isCostAvailable(row);
              const masterShown = row.isDirty
                ? (row.previewMasterPriceKgs ?? row.masterBranchPriceKgs)
                : row.masterBranchPriceKgs;
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
                  <td
                    className="px-3 py-2 font-medium text-slate-800"
                    title={costOk ? undefined : t('pricing.costUnavailable')}
                  >
                    {costOk ? formatPrice(row.costPriceKgs) : '—'}
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
                      <span>{row.hqMarkupPercent}%</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-600">
                    {costOk ? formatPrice(masterShown) : '—'}
                    {row.isDirty && costOk ? (
                      <span className="ml-1 text-[10px] text-amber-600">{t('pricing.previewOnly')}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <span className="inline-flex items-center gap-1">
                      {costOk ? formatPrice(effectiveShown) : '—'}
                      {showBadge ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {t('pricing.ruleAppliedBadge')}
                        </span>
                      ) : null}
                      {costOk ? (
                        <PriceExplanationButton
                          productId={row.id}
                          branchId={branchId}
                          priceType="BRANCH_PURCHASE"
                        />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{new Date(row.lastUpdated).toLocaleString()}</td>
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
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
