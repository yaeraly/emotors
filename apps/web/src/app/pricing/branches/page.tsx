'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { applyHqBranchWholesaleMarkup } from '@/lib/pricing-table-utils';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { BranchType, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type BranchPricingRow = {
  id: string;
  name: string;
  ownerName: string | null;
  branchType: BranchType;
  hqToBranchMarkupPercent: number;
  calculatedPriceKgs: number;
  referenceCostKgs: number;
  lastUpdated: string;
};

type EditableBranchRow = BranchPricingRow & {
  draftMarkup: number;
};

const MARKUP_PRESETS = [0, 10, 15, 20, 25];

function formatPrice(value: number) {
  return value.toFixed(0);
}

export default function PricingBranchesPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<EditableBranchRow[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [branches, me] = await Promise.all([
      apiFetch<BranchPricingRow[]>('/pricing/branches'),
      apiFetch<User>('/auth/me'),
    ]);
    setUser(me);
    setRows(
      branches.map((branch) => ({
        ...branch,
        draftMarkup: branch.hqToBranchMarkupPercent,
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
      [row.name, row.ownerName ?? ''].join(' ').toLowerCase().includes(query),
    );
  }, [rows, search]);

  function updateRow(branchId: string, draftMarkup: number) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== branchId) return row;
        const calculatedPriceKgs =
          row.branchType === 'HQ_BRANCH'
            ? row.referenceCostKgs
            : applyHqBranchWholesaleMarkup(row.referenceCostKgs, draftMarkup);
        return { ...row, draftMarkup, calculatedPriceKgs };
      }),
    );
  }

  async function save(branchId: string) {
    const row = rows.find((item) => item.id === branchId);
    if (!row || !canManage || row.branchType === 'HQ_BRANCH') return;

    setSavingId(branchId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/pricing/branches/${branchId}`, {
        method: 'PUT',
        body: JSON.stringify({ hqToBranchMarkupPercent: row.draftMarkup }),
      });
      setSuccess(t('pricing.branchSaved'));
      await load();
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

      <p className="text-xs text-slate-500">{t('pricing.hqToBranchHint')}</p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('pricing.searchBranches')}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:max-w-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('pricing.colBranch')}</th>
              <th className="px-3 py-2">{t('pricing.colOwner')}</th>
              <th className="px-3 py-2">{t('pricing.colBranchType')}</th>
              <th className="px-3 py-2">{t('pricing.colMarkup')}</th>
              <th className="px-3 py-2">{t('pricing.colCalculatedPrice')}</th>
              <th className="px-3 py-2">{t('pricing.colLastUpdated')}</th>
              <th className="px-3 py-2">{t('pricing.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 font-semibold text-slate-900">{row.name}</td>
                <td className="px-3 py-2 text-slate-700">{row.ownerName ?? '—'}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      row.branchType === 'HQ_BRANCH'
                        ? 'rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800'
                        : 'rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800'
                    }
                  >
                    {row.branchType === 'HQ_BRANCH'
                      ? t('pricing.branchTypeHq')
                      : t('pricing.branchTypeFranchise')}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.branchType === 'HQ_BRANCH' ? (
                    <span className="text-slate-400">—</span>
                  ) : canManage ? (
                    <select
                      value={row.draftMarkup}
                      onChange={(e) => updateRow(row.id, Number(e.target.value))}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    >
                      {MARKUP_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}%
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{row.hqToBranchMarkupPercent}%</span>
                  )}
                </td>
                <td className="px-3 py-2 font-medium text-slate-800">
                  {formatPrice(row.calculatedPriceKgs)}
                  <span className="ml-1 text-[10px] text-slate-400">
                    ({t('pricing.referenceCost')}: {formatPrice(row.referenceCostKgs)})
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {new Date(row.lastUpdated).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  {canManage && row.branchType === 'FRANCHISE_BRANCH' ? (
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
