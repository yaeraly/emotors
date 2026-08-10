'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import { usesUnifiedNavPageTitle } from '@/lib/unified-nav-page-title';
import type { User } from '@/lib/types';
import { customerTypeLabelKey, loyaltyCategoryLabelKey } from '@/lib/sale-customer-pricing';

import { toast } from '@/lib/toast';

type MarkupMatrix = {
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
};

type BranchPricingPolicy = MarkupMatrix & {
  branchId: string;
  standardMinKgs: number;
  standardMaxKgs: number;
  silverMinKgs: number;
  silverMaxKgs: number;
  goldMinKgs: number;
  goldMaxKgs: number;
  vipMinKgs: number;
  vipMaxKgs: number | null;
  minAllowedMarkupPercent: number;
  maxAllowedMarkupPercent: number;
  branchCustomizationEnabled: boolean;
  purchaseWindow: string;
  source: 'BRANCH' | 'HQ_DEFAULT';
  canEdit: boolean;
  hqDefaults?: Record<string, number | boolean | string | null>;
};

type PreviewResult = {
  customerType: 'RETAIL' | 'MASTER' | 'WHOLESALE';
  loyaltyCategory: 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP';
  basePriceKgs: number;
  markupPercent: number;
  markupAmountKgs: number;
  finalPriceKgs: number;
  affectsCostOrFifo: boolean;
};

type Draft = MarkupMatrix & {
  standardMinKgs: number;
  standardMaxKgs: number;
  silverMinKgs: number;
  silverMaxKgs: number;
  goldMinKgs: number;
  goldMaxKgs: number;
  vipMinKgs: number;
  vipMaxKgs: number | null;
};

const CATEGORIES = [
  { key: 'STANDARD' as const, minKey: 'standardMinKgs' as const, maxKey: 'standardMaxKgs' as const },
  { key: 'SILVER' as const, minKey: 'silverMinKgs' as const, maxKey: 'silverMaxKgs' as const },
  { key: 'GOLD' as const, minKey: 'goldMinKgs' as const, maxKey: 'goldMaxKgs' as const },
  { key: 'VIP' as const, minKey: 'vipMinKgs' as const, maxKey: 'vipMaxKgs' as const },
];

const MATRIX_ROWS: Array<{
  type: 'RETAIL' | 'MASTER' | 'WHOLESALE';
  fields: Array<keyof MarkupMatrix>;
}> = [
  {
    type: 'RETAIL',
    fields: [
      'retailStandardMarkupPercent',
      'retailSilverMarkupPercent',
      'retailGoldMarkupPercent',
      'retailVipMarkupPercent',
    ],
  },
  {
    type: 'MASTER',
    fields: [
      'masterStandardMarkupPercent',
      'masterSilverMarkupPercent',
      'masterGoldMarkupPercent',
      'masterVipMarkupPercent',
    ],
  },
  {
    type: 'WHOLESALE',
    fields: [
      'wholesaleStandardMarkupPercent',
      'wholesaleSilverMarkupPercent',
      'wholesaleGoldMarkupPercent',
      'wholesaleVipMarkupPercent',
    ],
  },
];

function toDraft(policy: BranchPricingPolicy): Draft {
  return {
    standardMinKgs: policy.standardMinKgs,
    standardMaxKgs: policy.standardMaxKgs,
    silverMinKgs: policy.silverMinKgs,
    silverMaxKgs: policy.silverMaxKgs,
    goldMinKgs: policy.goldMinKgs,
    goldMaxKgs: policy.goldMaxKgs,
    vipMinKgs: policy.vipMinKgs,
    vipMaxKgs: policy.vipMaxKgs,
    retailStandardMarkupPercent: policy.retailStandardMarkupPercent,
    retailSilverMarkupPercent: policy.retailSilverMarkupPercent,
    retailGoldMarkupPercent: policy.retailGoldMarkupPercent,
    retailVipMarkupPercent: policy.retailVipMarkupPercent,
    masterStandardMarkupPercent: policy.masterStandardMarkupPercent,
    masterSilverMarkupPercent: policy.masterSilverMarkupPercent,
    masterGoldMarkupPercent: policy.masterGoldMarkupPercent,
    masterVipMarkupPercent: policy.masterVipMarkupPercent,
    wholesaleStandardMarkupPercent: policy.wholesaleStandardMarkupPercent,
    wholesaleSilverMarkupPercent: policy.wholesaleSilverMarkupPercent,
    wholesaleGoldMarkupPercent: policy.wholesaleGoldMarkupPercent,
    wholesaleVipMarkupPercent: policy.wholesaleVipMarkupPercent,
  };
}

export default function BranchCeoPricingPolicyPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [policy, setPolicy] = useState<BranchPricingPolicy | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewCustomerType, setPreviewCustomerType] = useState<'RETAIL' | 'MASTER' | 'WHOLESALE'>(
    'MASTER',
  );
  const [previewCategory, setPreviewCategory] = useState<'STANDARD' | 'SILVER' | 'GOLD' | 'VIP'>(
    'GOLD',
  );
  const [previewBasePrice, setPreviewBasePrice] = useState('1100');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const showPageTitle = !usesUnifiedNavPageTitle(user);

  async function load() {
    const data = await apiFetch<BranchPricingPolicy>('/branch-ceo/pricing-policy');
    setPolicy(data);
    setDraft(toDraft(data));
  }

  useEffect(() => {
    void apiFetch<User>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function save() {
    if (!draft || !policy?.canEdit) return;
    setSaving(true);
    setError('');
    /* toast clear */ void 0;
    try {
      const updated = await apiFetch<BranchPricingPolicy>('/branch-ceo/pricing-policy', {
        method: 'PUT',
        body: JSON.stringify({
          ...draft,
          vipMaxKgs:
            draft.vipMaxKgs == null || Number.isNaN(Number(draft.vipMaxKgs))
              ? null
              : Number(draft.vipMaxKgs),
        }),
      });
      setPolicy(updated);
      setDraft(toDraft(updated));
      toast.success(t('branchCeo.pricingPolicySaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    setPreviewing(true);
    setError('');
    try {
      const result = await apiFetch<PreviewResult>('/branch-ceo/pricing-policy/preview', {
        method: 'POST',
        body: JSON.stringify({
          customerType: previewCustomerType,
          loyaltyCategory: previewCategory,
          basePriceKgs: Number(previewBasePrice),
        }),
      });
      setPreview(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPreviewing(false);
    }
  }

  function updateDraftNumber<K extends keyof Draft>(key: K, value: string) {
    setDraft((current) => {
      if (!current) return current;
      if (key === 'vipMaxKgs' && value.trim() === '') {
        return { ...current, vipMaxKgs: null };
      }
      return { ...current, [key]: Number(value) };
    });
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        {showPageTitle ? (
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              Branch CEO
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('branchCeo.pricingPolicyTitle')}</h2>
            <p className="mt-2 text-slate-500">{t('branchCeo.pricingPolicySubtitle')}</p>
          </div>
        ) : (
          <p className="text-slate-500">{t('branchCeo.pricingPolicySubtitle')}</p>
        )}

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        {policy && draft ? (
          <>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
              <h3 className="text-lg font-bold text-slate-950">
                {t('branchCeo.pricingCustomerCategories')}
              </h3>
              <p className="text-sm text-slate-600">{t('branchCeo.pricingCategoriesHint')}</p>
              <ul className="grid gap-2 md:grid-cols-4">
                {CATEGORIES.map((category) => (
                  <li
                    key={category.key}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800"
                  >
                    {t(loyaltyCategoryLabelKey(category.key))}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">
                {t('branchCeo.pricingPurchaseWindow')}: {t('pricing.loyaltyWindow90')}
              </p>
              <p className="text-xs text-slate-500">
                {t('branchCeo.pricingHqLimits')}: {policy.minAllowedMarkupPercent}% –{' '}
                {policy.maxAllowedMarkupPercent}%
              </p>
              {!policy.canEdit ? (
                <p className="text-sm text-amber-700">{t('branchCeo.pricingCustomizationDisabled')}</p>
              ) : null}
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-950">{t('branchCeo.pricingThresholds')}</h3>
              <p className="text-sm text-slate-600">{t('branchCeo.pricingThresholdsHint')}</p>
              <div className="space-y-3">
                {CATEGORIES.map((category) => (
                  <div
                    key={category.key}
                    className="grid gap-3 rounded-xl border border-slate-100 p-3 md:grid-cols-[140px_1fr_1fr]"
                  >
                    <p className="self-center text-sm font-semibold text-slate-800">
                      {t(loyaltyCategoryLabelKey(category.key))}
                    </p>
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">{t('branchCeo.pricingMinAmount')}</span>
                      <input
                        type="number"
                        min={0}
                        disabled={!policy.canEdit}
                        value={draft[category.minKey] ?? 0}
                        onChange={(e) => updateDraftNumber(category.minKey, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">{t('branchCeo.pricingMaxAmount')}</span>
                      <input
                        type="number"
                        min={0}
                        disabled={!policy.canEdit}
                        value={
                          category.maxKey === 'vipMaxKgs'
                            ? draft.vipMaxKgs ?? ''
                            : draft[category.maxKey]
                        }
                        onChange={(e) => updateDraftNumber(category.maxKey, e.target.value)}
                        placeholder={category.key === 'VIP' ? '∞' : undefined}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-950">
                {t('branchCeo.pricingCustomerTypeMarkups')}
              </h3>
              <p className="text-sm text-slate-600">{t('branchCeo.pricingMarkupHint')}</p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">{t('customers.customerType')}</th>
                      {CATEGORIES.map((category) => (
                        <th key={category.key} className="px-3 py-2">
                          {t(loyaltyCategoryLabelKey(category.key))} (%)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MATRIX_ROWS.map((row) => (
                      <tr key={row.type} className="border-b border-slate-100">
                        <td className="px-3 py-3 font-semibold text-slate-800">
                          {t(customerTypeLabelKey(row.type))}
                        </td>
                        {row.fields.map((field) => (
                          <td key={field} className="px-3 py-2">
                            <input
                              type="number"
                              min={policy.minAllowedMarkupPercent}
                              max={policy.maxAllowedMarkupPercent}
                              step="0.1"
                              disabled={!policy.canEdit}
                              value={draft[field]}
                              onChange={(e) => updateDraftNumber(field, e.target.value)}
                              className="w-full min-w-[5rem] rounded-lg border border-slate-300 px-2 py-1.5 disabled:bg-slate-50"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {policy.canEdit ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              ) : (
                <p className="text-sm text-slate-500">{t('pricing.readOnly')}</p>
              )}
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-slate-950">{t('branchCeo.pricingPreview')}</h3>
              <p className="text-sm text-slate-600">{t('branchCeo.pricingPreviewHint')}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-500">{t('customers.customerType')}</span>
                  <select
                    value={previewCustomerType}
                    onChange={(e) =>
                      setPreviewCustomerType(e.target.value as typeof previewCustomerType)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="RETAIL">{t('customers.customerTypeRetail')}</option>
                    <option value="MASTER">{t('customers.customerTypeMaster')}</option>
                    <option value="WHOLESALE">{t('customers.customerTypeWholesale')}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-500">{t('customers.loyaltyCategory')}</span>
                  <select
                    value={previewCategory}
                    onChange={(e) =>
                      setPreviewCategory(e.target.value as typeof previewCategory)
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.key} value={category.key}>
                        {t(loyaltyCategoryLabelKey(category.key))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-slate-500">{t('branchCeo.pricingBasePrice')}</span>
                  <input
                    type="number"
                    min={0}
                    value={previewBasePrice}
                    onChange={(e) => setPreviewBasePrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={previewing}
                onClick={() => void runPreview()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
              >
                {t('branchCeo.pricingRunPreview')}
              </button>
              {preview ? (
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm md:grid-cols-2">
                  <p>
                    <span className="text-slate-500">{t('customers.customerType')}: </span>
                    {t(customerTypeLabelKey(preview.customerType))}
                  </p>
                  <p>
                    <span className="text-slate-500">{t('customers.loyaltyCategory')}: </span>
                    {t(loyaltyCategoryLabelKey(preview.loyaltyCategory))}
                  </p>
                  <p>
                    <span className="text-slate-500">{t('branchCeo.pricingBasePrice')}: </span>
                    {preview.basePriceKgs.toLocaleString('ru-RU')} KGS
                  </p>
                  <p>
                    <span className="text-slate-500">{t('branchCeo.pricingMarkup')}: </span>
                    {preview.markupPercent}% ({preview.markupAmountKgs.toLocaleString('ru-RU')} KGS)
                  </p>
                  <p className="md:col-span-2 font-semibold text-slate-950">
                    {t('branchCeo.pricingFinalPrice')}: {preview.finalPriceKgs.toLocaleString('ru-RU')}{' '}
                    KGS
                  </p>
                  <p className="md:col-span-2 text-xs text-slate-500">
                    {t('branchCeo.pricingNoCostImpact')}
                  </p>
                </div>
              ) : null}
            </article>
          </>
        ) : (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        )}
      </section>
    </ProtectedShell>
  );
}
