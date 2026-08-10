'use client';

import { useEffect, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type Settings = {
  id: string;
  baseCalculationSource: string;
  roundingStrategy: string;
  roundUpPrecision: number;
  currency: string;
  defaultDecimalPrecision: number;
  defaultMinimumMarkup: number;
  defaultMaximumMarkup: number;
  defaultActivationTimezone: string;
};

type LoyaltySettings = {
  id: string;
  purchaseWindow: 'TOTAL' | 'ROLLING_90_DAYS' | 'ROLLING_180_DAYS';
  standardThresholdKgs: number;
  silverThresholdKgs: number;
  goldThresholdKgs: number;
  vipThresholdKgs: number;
  standardMaxKgs: number;
  silverMaxKgs: number;
  goldMaxKgs: number;
  vipMaxKgs: number | null;
  standardMarkupPercent: number;
  silverMarkupPercent: number;
  goldMarkupPercent: number;
  vipMarkupPercent: number;
  retailStandardMarkupPercent: number;
  retailSilverMarkupPercent: number;
  retailGoldMarkupPercent: number;
  retailVipMarkupPercent: number;
  masterStandardMarkupPercent: number;
  masterSilverMarkupPercent: number;
  masterGoldMarkupPercent: number;
  masterVipMarkupPercent: number;
  wholesaleStandardMarkupPercent: number;
  wholesaleSilverMarkupPercent: number;
  wholesaleGoldMarkupPercent: number;
  wholesaleVipMarkupPercent: number;
  minAllowedMarkupPercent: number;
  maxAllowedMarkupPercent: number;
  branchCustomizationEnabled: boolean;
  allowDowngrade: boolean;
};

export default function PricingSettingsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [loyalty, setLoyalty] = useState<LoyaltySettings | null>(null);
  const [loyaltyDraft, setLoyaltyDraft] = useState<Partial<LoyaltySettings>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [me, data, loyaltyData] = await Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<Settings>('/pricing/settings'),
      apiFetch<LoyaltySettings>('/pricing/loyalty-settings'),
    ]);
    setUser(me);
    setSettings(data);
    setDraft(data);
    setLoyalty(loyaltyData);
    setLoyaltyDraft(loyaltyData);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function save() {
    if (!canManage) return;
    setSaving(true);
    setError('');
    /* toast clear */ void 0;
    try {
      const updated = await apiFetch<Settings>('/pricing/settings', {
        method: 'PUT',
        body: JSON.stringify({
          baseCalculationSource: draft.baseCalculationSource,
          roundingStrategy: draft.roundingStrategy,
          roundUpPrecision: Number(draft.roundUpPrecision),
          currency: draft.currency,
          defaultDecimalPrecision: Number(draft.defaultDecimalPrecision),
          defaultMinimumMarkup: Number(draft.defaultMinimumMarkup),
          defaultMaximumMarkup: Number(draft.defaultMaximumMarkup),
          defaultActivationTimezone: draft.defaultActivationTimezone,
        }),
      });
      setSettings(updated);
      setDraft(updated);
      toast.success(t('pricing.settingsSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function saveLoyalty() {
    if (!canManage) return;
    setSavingLoyalty(true);
    setError('');
    /* toast clear */ void 0;
    try {
      const updated = await apiFetch<LoyaltySettings>('/pricing/loyalty-settings', {
        method: 'PUT',
        body: JSON.stringify({
          purchaseWindow: loyaltyDraft.purchaseWindow ?? 'ROLLING_90_DAYS',
          standardThresholdKgs: Number(loyaltyDraft.standardThresholdKgs ?? 0),
          silverThresholdKgs: Number(loyaltyDraft.silverThresholdKgs ?? 0),
          goldThresholdKgs: Number(loyaltyDraft.goldThresholdKgs ?? 0),
          vipThresholdKgs: Number(loyaltyDraft.vipThresholdKgs ?? 0),
          standardMaxKgs: Number(loyaltyDraft.standardMaxKgs ?? 0),
          silverMaxKgs: Number(loyaltyDraft.silverMaxKgs ?? 0),
          goldMaxKgs: Number(loyaltyDraft.goldMaxKgs ?? 0),
          vipMaxKgs:
            loyaltyDraft.vipMaxKgs == null || Number.isNaN(Number(loyaltyDraft.vipMaxKgs))
              ? null
              : Number(loyaltyDraft.vipMaxKgs),
          retailStandardMarkupPercent: Number(loyaltyDraft.retailStandardMarkupPercent ?? 5),
          retailSilverMarkupPercent: Number(loyaltyDraft.retailSilverMarkupPercent ?? 3),
          retailGoldMarkupPercent: Number(loyaltyDraft.retailGoldMarkupPercent ?? 1.5),
          retailVipMarkupPercent: Number(loyaltyDraft.retailVipMarkupPercent ?? 0),
          masterStandardMarkupPercent: Number(loyaltyDraft.masterStandardMarkupPercent ?? 6),
          masterSilverMarkupPercent: Number(loyaltyDraft.masterSilverMarkupPercent ?? 4),
          masterGoldMarkupPercent: Number(loyaltyDraft.masterGoldMarkupPercent ?? 2),
          masterVipMarkupPercent: Number(loyaltyDraft.masterVipMarkupPercent ?? 1),
          wholesaleStandardMarkupPercent: Number(loyaltyDraft.wholesaleStandardMarkupPercent ?? 5),
          wholesaleSilverMarkupPercent: Number(loyaltyDraft.wholesaleSilverMarkupPercent ?? 3),
          wholesaleGoldMarkupPercent: Number(loyaltyDraft.wholesaleGoldMarkupPercent ?? 1.5),
          wholesaleVipMarkupPercent: Number(loyaltyDraft.wholesaleVipMarkupPercent ?? 0),
          minAllowedMarkupPercent: Number(loyaltyDraft.minAllowedMarkupPercent ?? 0),
          maxAllowedMarkupPercent: Number(loyaltyDraft.maxAllowedMarkupPercent ?? 0),
          branchCustomizationEnabled: Boolean(loyaltyDraft.branchCustomizationEnabled),
          allowDowngrade: Boolean(loyaltyDraft.allowDowngrade),
        }),
      });
      setLoyalty(updated);
      setLoyaltyDraft(updated);
      toast.success(t('pricing.loyaltySaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSavingLoyalty(false);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="settings" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <p className="text-sm text-slate-600">{t('pricing.settingsHint')}</p>

      {settings ? (
        <div className="max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">{t('pricing.settingsBaseSource')}</span>
            <select
              disabled={!canManage}
              value={draft.baseCalculationSource ?? 'FIFO_COST'}
              onChange={(e) => setDraft((d) => ({ ...d, baseCalculationSource: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="FIFO_COST">FIFO Cost</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">{t('pricing.settingsRounding')}</span>
            <select
              disabled={!canManage}
              value={draft.roundingStrategy ?? 'ROUNDUP'}
              onChange={(e) => setDraft((d) => ({ ...d, roundingStrategy: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="ROUNDUP">ROUNDUP</option>
              <option value="ROUND_NEAREST">ROUND_NEAREST</option>
              <option value="NONE">NONE</option>
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.settingsRoundUpPrecision')}</span>
              <input
                type="number"
                disabled={!canManage}
                value={draft.roundUpPrecision ?? -1}
                onChange={(e) => setDraft((d) => ({ ...d, roundUpPrecision: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.settingsCurrency')}</span>
              <input
                disabled={!canManage}
                value={draft.currency ?? 'KGS'}
                onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.settingsDecimalPrecision')}</span>
              <input
                type="number"
                disabled={!canManage}
                value={draft.defaultDecimalPrecision ?? 2}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, defaultDecimalPrecision: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.settingsTimezone')}</span>
              <input
                disabled={!canManage}
                value={draft.defaultActivationTimezone ?? 'Asia/Bishkek'}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, defaultActivationTimezone: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.settingsMinMarkup')}</span>
              <input
                type="number"
                disabled={!canManage}
                value={draft.defaultMinimumMarkup ?? 0}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, defaultMinimumMarkup: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.settingsMaxMarkup')}</span>
              <input
                type="number"
                disabled={!canManage}
                value={draft.defaultMaximumMarkup ?? 0}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, defaultMaximumMarkup: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          {canManage ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          ) : (
            <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p>
          )}
        </div>
      ) : null}

      {loyalty ? (
        <div className="mt-6 max-w-2xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{t('pricing.loyaltySettings')}</h2>
          <p className="text-sm text-slate-600">{t('pricing.loyaltyBranchMarkupHint')}</p>

          <label className="block text-sm">
            <span className="mb-1 block text-slate-500">{t('pricing.loyaltyPurchaseWindow')}</span>
            <select
              disabled={!canManage}
              value={loyaltyDraft.purchaseWindow ?? 'ROLLING_90_DAYS'}
              onChange={(e) =>
                setLoyaltyDraft((d) => ({
                  ...d,
                  purchaseWindow: e.target.value as LoyaltySettings['purchaseWindow'],
                }))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="TOTAL">{t('pricing.loyaltyWindowTotal')}</option>
              <option value="ROLLING_90_DAYS">{t('pricing.loyaltyWindow90')}</option>
              <option value="ROLLING_180_DAYS">{t('pricing.loyaltyWindow180')}</option>
            </select>
          </label>

          <p className="text-sm font-semibold text-slate-700">{t('pricing.loyaltyThresholds')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                ['standardThresholdKgs', 'Standard min'],
                ['standardMaxKgs', 'Standard max'],
                ['silverThresholdKgs', 'Silver min'],
                ['silverMaxKgs', 'Silver max'],
                ['goldThresholdKgs', 'Gold min'],
                ['goldMaxKgs', 'Gold max'],
                ['vipThresholdKgs', 'VIP min'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="mb-1 block text-slate-500">{label}</span>
                <input
                  type="number"
                  disabled={!canManage}
                  min={0}
                  value={loyaltyDraft[key] ?? 0}
                  onChange={(e) =>
                    setLoyaltyDraft((d) => ({ ...d, [key]: Number(e.target.value) }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            ))}
          </div>

          <p className="text-sm font-semibold text-slate-700">{t('pricing.loyaltyMarkups')}</p>
          <p className="text-xs text-slate-500">{t('branchCeo.pricingCustomerTypeMarkups')}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">{t('customers.customerType')}</th>
                  <th className="px-2 py-2">Standard %</th>
                  <th className="px-2 py-2">Silver %</th>
                  <th className="px-2 py-2">Gold %</th>
                  <th className="px-2 py-2">VIP %</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    [
                      'RETAIL',
                      'retailStandardMarkupPercent',
                      'retailSilverMarkupPercent',
                      'retailGoldMarkupPercent',
                      'retailVipMarkupPercent',
                    ],
                    [
                      'MASTER',
                      'masterStandardMarkupPercent',
                      'masterSilverMarkupPercent',
                      'masterGoldMarkupPercent',
                      'masterVipMarkupPercent',
                    ],
                    [
                      'WHOLESALE',
                      'wholesaleStandardMarkupPercent',
                      'wholesaleSilverMarkupPercent',
                      'wholesaleGoldMarkupPercent',
                      'wholesaleVipMarkupPercent',
                    ],
                  ] as const
                ).map(([type, ...fields]) => (
                  <tr key={type} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-semibold text-slate-800">
                      {t(
                        type === 'RETAIL'
                          ? 'customers.customerTypeRetail'
                          : type === 'MASTER'
                            ? 'customers.customerTypeMaster'
                            : 'customers.customerTypeWholesale',
                      )}
                    </td>
                    {fields.map((field) => (
                      <td key={field} className="px-2 py-2">
                        <input
                          type="number"
                          disabled={!canManage}
                          min={0}
                          max={100}
                          step="0.1"
                          value={loyaltyDraft[field] ?? 0}
                          onChange={(e) =>
                            setLoyaltyDraft((d) => ({ ...d, [field]: Number(e.target.value) }))
                          }
                          className="w-full min-w-[4.5rem] rounded-lg border border-slate-300 px-2 py-1.5"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm font-semibold text-slate-700">{t('pricing.loyaltyMarkupLimits')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.loyaltyMinAllowedMarkup')}</span>
              <input
                type="number"
                disabled={!canManage}
                min={0}
                max={100}
                step="0.1"
                value={loyaltyDraft.minAllowedMarkupPercent ?? 0}
                onChange={(e) =>
                  setLoyaltyDraft((d) => ({
                    ...d,
                    minAllowedMarkupPercent: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t('pricing.loyaltyMaxAllowedMarkup')}</span>
              <input
                type="number"
                disabled={!canManage}
                min={0}
                max={100}
                step="0.1"
                value={loyaltyDraft.maxAllowedMarkupPercent ?? 0}
                onChange={(e) =>
                  setLoyaltyDraft((d) => ({
                    ...d,
                    maxAllowedMarkupPercent: Number(e.target.value),
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={Boolean(loyaltyDraft.branchCustomizationEnabled)}
              onChange={(e) =>
                setLoyaltyDraft((d) => ({
                  ...d,
                  branchCustomizationEnabled: e.target.checked,
                }))
              }
            />
            {t('pricing.branchCustomizationEnabled')}
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={Boolean(loyaltyDraft.allowDowngrade)}
              onChange={(e) =>
                setLoyaltyDraft((d) => ({ ...d, allowDowngrade: e.target.checked }))
              }
            />
            {t('pricing.loyaltyAllowDowngrade')}
          </label>

          {canManage ? (
            <button
              type="button"
              disabled={savingLoyalty}
              onClick={() => void saveLoyalty()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('common.save')}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
