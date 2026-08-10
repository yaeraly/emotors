'use client';

import { useEffect, useMemo, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type DraftVersion = { id: string; label: string; versionNumber: number; status: string };
type Simulation = {
  id: string;
  summary: Record<string, number | string | string[]>;
  rows: Array<Record<string, unknown>>;
  validationErrors?: string[];
  createdAt: string;
};

const CHANNELS = ['FRANCHISE', 'RETAIL', 'WHOLESALE'] as const;

export default function PricingSimulationPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [draft, setDraft] = useState<DraftVersion | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('FRANCHISE');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [versions, me] = await Promise.all([
      apiFetch<DraftVersion[]>('/pricing/versions'),
      apiFetch<User>('/auth/me'),
    ]);
    const draftVersion =
      versions.find((v) => v.status === 'DRAFT' || v.status === 'READY_FOR_REVIEW') ?? null;
    setDraft(draftVersion);
    setUser(me);
    if (draftVersion) {
      try {
        const sim = await apiFetch<Simulation>(`/pricing/versions/${draftVersion.id}/simulation`);
        setSimulation(sim);
      } catch {
        setSimulation(null);
      }
    } else {
      setSimulation(null);
    }
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function refreshSimulation() {
    if (!draft || !canManage) return;
    setLoading(true);
    setError('');
    try {
      const sim = await apiFetch<Simulation>(`/pricing/versions/${draft.id}/simulation/refresh`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setSimulation(sim);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (!simulation) return [];
    return simulation.rows.filter((row) => String(row.channel ?? 'FRANCHISE') === channel);
  }, [simulation, channel]);

  return (
    <>
      <PricingHubNav activeTab="simulation" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-600">{t('pricing.simulationHint')}</p>
      {!draft ? <p className="text-sm text-amber-700">{t('pricing.noDraftVersion')}</p> : null}
      {canManage && draft ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => void refreshSimulation()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('pricing.runSimulation')}
        </button>
      ) : null}
      {simulation ? (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
            <div>
              <span className="text-xs text-slate-500">{t('pricing.productsAffected')}</span>
              <p className="font-bold">{Number(simulation.summary.productsAffected ?? 0)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">{t('pricing.branchesAffected')}</span>
              <p className="font-bold">{Number(simulation.summary.branchesAffected ?? 0)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">{t('pricing.priceIncreases')}</span>
              <p className="font-bold">{Number(simulation.summary.productsWithIncrease ?? 0)}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">{t('pricing.priceDecreases')}</span>
              <p className="font-bold">{Number(simulation.summary.productsWithDecrease ?? 0)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setChannel(item)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  channel === item
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                {t(`pricing.simulationChannel.${item}`)}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[1400px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">{t('pricing.product')}</th>
                  <th className="px-3 py-3">{t('pricing.branch')}</th>
                  <th className="px-3 py-3">{t('pricing.profile')}</th>
                  <th className="px-3 py-3">{t('pricing.simFifoCost')}</th>
                  <th className="px-3 py-3">{t('pricing.colMasterPrice')}</th>
                  <th className="px-3 py-3">{t('pricing.simBranchPrice')}</th>
                  <th className="px-3 py-3">{t('pricing.simRetailPrice')}</th>
                  <th className="px-3 py-3">{t('pricing.simWholesalePrice')}</th>
                  <th className="px-3 py-3">{t('pricing.simHqMargin')}</th>
                  <th className="px-3 py-3">{t('pricing.simBranchMargin')}</th>
                  <th className="px-3 py-3">{t('pricing.simAppliedRule')}</th>
                  <th className="px-3 py-3">{t('pricing.simOverride')}</th>
                  <th className="px-3 py-3">{t('pricing.simFinalPrice')}</th>
                  <th className="px-3 py-3">{t('pricing.diff')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    <td className="px-3 py-2">{String(row.sku ?? '')}</td>
                    <td className="px-3 py-2">{String(row.branchName ?? '')}</td>
                    <td className="px-3 py-2">{String(row.profileName ?? '')}</td>
                    <td className="px-3 py-2">{Number(row.fifoCostKgs ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(row.masterBranchPriceKgs ?? row.branchPriceKgs ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(row.effectiveBranchPriceKgs ?? row.branchPriceKgs ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(row.retailPriceKgs ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(row.wholesalePriceKgs ?? 0).toFixed(0)}</td>
                    <td className="px-3 py-2">{Number(row.hqMarginPercent ?? 0).toFixed(1)}%</td>
                    <td className="px-3 py-2">{Number(row.branchMarginPercent ?? 0).toFixed(1)}%</td>
                    <td className="px-3 py-2">{String(row.appliedRuleType ?? '—')}</td>
                    <td className="px-3 py-2">
                      {row.temporaryOverride ? t('pricing.explanationApplied') : t('pricing.explanationNone')}
                    </td>
                    <td className="px-3 py-2 font-semibold">
                      {Number(row.finalSellingPriceKgs ?? row.newPriceKgs ?? 0).toFixed(0)}
                    </td>
                    <td className="px-3 py-2">{Number(row.diffKgs ?? 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
