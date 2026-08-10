'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

import { toast } from '@/lib/toast';

type MaximumPricePolicy = 'DISABLED' | 'WARNING_ONLY' | 'HARD_LIMIT';
type MaximumPricePolicySource = 'CATEGORY' | 'PRODUCT';

type ProductMaximumPolicy = {
  productId: string;
  categoryName: string;
  retailMaximumPolicySource: MaximumPricePolicySource;
  wholesaleMaximumPolicySource: MaximumPricePolicySource;
  retailMaximumPolicy: MaximumPricePolicy;
  wholesaleMaximumPolicy: MaximumPricePolicy;
  maximumRetailMarkupPercent: number;
  maximumWholesaleMarkupPercent: number;
  resolvedRetailMaximumPolicy: MaximumPricePolicy;
  resolvedWholesaleMaximumPolicy: MaximumPricePolicy;
  resolvedRetailMaximumMarkupPercent: number;
  resolvedWholesaleMaximumMarkupPercent: number;
  categoryDefaultRetailMaximumPolicy: MaximumPricePolicy | null;
  categoryDefaultWholesaleMaximumPolicy: MaximumPricePolicy | null;
};

type Props = {
  productId: string;
};

const policyOptions: MaximumPricePolicy[] = ['DISABLED', 'WARNING_ONLY', 'HARD_LIMIT'];

export function ProductMaximumPolicySection({ productId }: Props) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [policy, setPolicy] = useState<ProductMaximumPolicy | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);

  async function load() {
    const [me, data] = await Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<ProductMaximumPolicy>(`/pricing/products/${productId}/maximum-policy`),
    ]);
    setUser(me);
    setPolicy(data);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [productId, t]);

  async function save() {
    if (!policy || !canManage) return;
    setSaving(true);
    setError('');
    /* toast clear */ void 0;
    try {
      await apiFetch(`/pricing/products/${productId}/maximum-policy`, {
        method: 'PUT',
        body: JSON.stringify({
          retailMaximumPolicySource: policy.retailMaximumPolicySource,
          wholesaleMaximumPolicySource: policy.wholesaleMaximumPolicySource,
          retailMaximumPolicy:
            policy.retailMaximumPolicySource === 'PRODUCT' ? policy.retailMaximumPolicy : undefined,
          wholesaleMaximumPolicy:
            policy.wholesaleMaximumPolicySource === 'PRODUCT' ? policy.wholesaleMaximumPolicy : undefined,
          maximumRetailMarkupPercent:
            policy.retailMaximumPolicySource === 'PRODUCT'
              ? policy.maximumRetailMarkupPercent
              : undefined,
          maximumWholesaleMarkupPercent:
            policy.wholesaleMaximumPolicySource === 'PRODUCT'
              ? policy.maximumWholesaleMarkupPercent
              : undefined,
        }),
      });
      toast.success(t('pricing.productPolicySaved'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  if (!policy) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{t('pricing.productMaximumPolicyTitle')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('pricing.productMaximumPolicyHint')}</p>

      {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-100 p-3">
          <p className="text-sm font-semibold text-slate-800">{t('pricing.retailPolicySource')}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              disabled={!canManage}
              checked={policy.retailMaximumPolicySource === 'CATEGORY'}
              onChange={() =>
                setPolicy((current) =>
                  current ? { ...current, retailMaximumPolicySource: 'CATEGORY' } : current,
                )
              }
            />
            {t('pricing.policySourceCategory')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              disabled={!canManage}
              checked={policy.retailMaximumPolicySource === 'PRODUCT'}
              onChange={() =>
                setPolicy((current) =>
                  current ? { ...current, retailMaximumPolicySource: 'PRODUCT' } : current,
                )
              }
            />
            {t('pricing.policySourceProduct')}
          </label>
          {policy.retailMaximumPolicySource === 'CATEGORY' ? (
            <p className="text-xs text-slate-500">
              {t('pricing.inheritedRetailPolicy')}:{' '}
              {t(`pricing.maximumPolicy.${policy.resolvedRetailMaximumPolicy}`)} (
              {policy.resolvedRetailMaximumMarkupPercent}%)
            </p>
          ) : (
            <div className="space-y-2">
              <select
                disabled={!canManage}
                value={policy.retailMaximumPolicy}
                onChange={(e) =>
                  setPolicy((current) =>
                    current
                      ? { ...current, retailMaximumPolicy: e.target.value as MaximumPricePolicy }
                      : current,
                  )
                }
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              >
                {policyOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`pricing.maximumPolicy.${option}`)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!canManage || policy.retailMaximumPolicy === 'DISABLED'}
                value={policy.maximumRetailMarkupPercent}
                onChange={(e) =>
                  setPolicy((current) =>
                    current
                      ? { ...current, maximumRetailMarkupPercent: Number(e.target.value) }
                      : current,
                  )
                }
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-100 p-3">
          <p className="text-sm font-semibold text-slate-800">{t('pricing.wholesalePolicySource')}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              disabled={!canManage}
              checked={policy.wholesaleMaximumPolicySource === 'CATEGORY'}
              onChange={() =>
                setPolicy((current) =>
                  current ? { ...current, wholesaleMaximumPolicySource: 'CATEGORY' } : current,
                )
              }
            />
            {t('pricing.policySourceCategory')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              disabled={!canManage}
              checked={policy.wholesaleMaximumPolicySource === 'PRODUCT'}
              onChange={() =>
                setPolicy((current) =>
                  current ? { ...current, wholesaleMaximumPolicySource: 'PRODUCT' } : current,
                )
              }
            />
            {t('pricing.policySourceProduct')}
          </label>
          {policy.wholesaleMaximumPolicySource === 'CATEGORY' ? (
            <p className="text-xs text-slate-500">
              {t('pricing.inheritedWholesalePolicy')}:{' '}
              {t(`pricing.maximumPolicy.${policy.resolvedWholesaleMaximumPolicy}`)} (
              {policy.resolvedWholesaleMaximumMarkupPercent}%)
            </p>
          ) : (
            <div className="space-y-2">
              <select
                disabled={!canManage}
                value={policy.wholesaleMaximumPolicy}
                onChange={(e) =>
                  setPolicy((current) =>
                    current
                      ? { ...current, wholesaleMaximumPolicy: e.target.value as MaximumPricePolicy }
                      : current,
                  )
                }
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              >
                {policyOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`pricing.maximumPolicy.${option}`)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!canManage || policy.wholesaleMaximumPolicy === 'DISABLED'}
                value={policy.maximumWholesaleMarkupPercent}
                onChange={(e) =>
                  setPolicy((current) =>
                    current
                      ? { ...current, maximumWholesaleMarkupPercent: Number(e.target.value) }
                      : current,
                  )
                }
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {canManage ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? '…' : t('common.save')}
        </button>
      ) : null}
    </section>
  );
}
