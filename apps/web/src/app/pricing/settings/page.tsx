'use client';

import { useEffect, useState } from 'react';
import { PricingHubNav } from '@/components/pricing/PricingHubNav';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

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

export default function PricingSettingsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [me, data] = await Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<Settings>('/pricing/settings'),
    ]);
    setUser(me);
    setSettings(data);
    setDraft(data);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function save() {
    if (!canManage) return;
    setSaving(true);
    setError('');
    setSuccess('');
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
      setSuccess(t('pricing.settingsSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PricingHubNav activeTab="settings" />
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}
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
    </>
  );
}
