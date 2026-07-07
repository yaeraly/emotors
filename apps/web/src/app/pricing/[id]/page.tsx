'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type PricingPolicyDetail = {
  id: string;
  sku: string;
  productName?: string | null;
  purchasePriceYuan: number;
  landedCostKgs: number;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
  maximumDiscountPercent: number;
  status: string;
  reason?: string | null;
  history?: Array<{
    id: string;
    fieldName: string;
    oldValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
    createdAt: string;
    changedBy?: { fullName: string };
  }>;
};

const emptyForm = {
  sku: '',
  productName: '',
  purchasePriceYuan: 0,
  landedCostKgs: 0,
  wholesalePriceKgs: 0,
  hqBranchWholesalePriceKgs: 0,
  recommendedRetailPriceKgs: 0,
  minimumSellingPriceKgs: 0,
  maximumDiscountPercent: 10,
  reason: '',
};

export default function PricingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const isNew = id === 'new';
  const [user, setUser] = useState<User | null>(null);
  const [policy, setPolicy] = useState<PricingPolicyDetail | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = canManagePricingPolicy(user);

  useEffect(() => {
    apiFetch<User>('/auth/me').then(setUser).catch(() => undefined);
    if (isNew) return;
    apiFetch<PricingPolicyDetail>(`/pricing/policies/${id}`)
      .then((detail) => {
        setPolicy(detail);
        setForm({
          sku: detail.sku,
          productName: detail.productName ?? '',
          purchasePriceYuan: Number(detail.purchasePriceYuan),
          landedCostKgs: Number(detail.landedCostKgs),
          wholesalePriceKgs: Number(detail.wholesalePriceKgs),
          hqBranchWholesalePriceKgs: Number(detail.hqBranchWholesalePriceKgs),
          recommendedRetailPriceKgs: Number(detail.recommendedRetailPriceKgs),
          minimumSellingPriceKgs: Number(detail.minimumSellingPriceKgs),
          maximumDiscountPercent: Number(detail.maximumDiscountPercent),
          reason: detail.reason ?? '',
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, isNew, t]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...form,
        productName: form.productName || undefined,
        reason: form.reason || undefined,
      };
      const result = isNew
        ? await apiFetch<PricingPolicyDetail>('/pricing/policies', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch<PricingPolicyDetail>(`/pricing/policies/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setSuccess(t('pricing.saved'));
      if (isNew) {
        router.replace(`/pricing/${result.id}`);
      } else {
        setPolicy(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    if (!canManage || isNew) return;
    setError('');
    try {
      const result = await apiFetch<PricingPolicyDetail>(`/pricing/policies/${id}/activate`, {
        method: 'POST',
        body: JSON.stringify({ reason: form.reason || undefined }),
      });
      setPolicy(result);
      setSuccess(t('pricing.activated'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function archive() {
    if (!canManage || isNew) return;
    setError('');
    try {
      const result = await apiFetch<PricingPolicyDetail>(`/pricing/policies/${id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ reason: form.reason || undefined }),
      });
      setPolicy(result);
      setSuccess(t('pricing.archived'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/pricing" className="text-sm font-semibold text-blue-600">← {t('pricing.title')}</Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">
            {isNew ? t('pricing.createPolicy') : policy?.productName ?? policy?.sku ?? t('pricing.title')}
          </h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <form onSubmit={(event) => void save(event)} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <Field label="SKU" value={form.sku} onChange={(value) => setForm({ ...form, sku: String(value) })} disabled={!isNew || !canManage} required />
          <Field label={t('sales.product')} value={form.productName} onChange={(value) => setForm({ ...form, productName: String(value) })} disabled={!canManage} />
          <Field label={t('pricing.purchaseCostYuan')} value={form.purchasePriceYuan} onChange={(value) => setForm({ ...form, purchasePriceYuan: Number(value) })} disabled={!canManage} type="number" />
          <Field label={t('pricing.landedCost')} value={form.landedCostKgs} onChange={(value) => setForm({ ...form, landedCostKgs: Number(value) })} disabled={!canManage} type="number" />
          <Field label={t('pricing.wholesalePrice')} value={form.wholesalePriceKgs} onChange={(value) => setForm({ ...form, wholesalePriceKgs: Number(value) })} disabled={!canManage} type="number" />
          <Field label={t('pricing.hqBranchWholesalePrice')} value={form.hqBranchWholesalePriceKgs} onChange={(value) => setForm({ ...form, hqBranchWholesalePriceKgs: Number(value) })} disabled={!canManage} type="number" />
          <Field label={t('pricing.recommendedRetailPrice')} value={form.recommendedRetailPriceKgs} onChange={(value) => setForm({ ...form, recommendedRetailPriceKgs: Number(value) })} disabled={!canManage} type="number" />
          <Field label={t('pricing.minimumSellingPrice')} value={form.minimumSellingPriceKgs} onChange={(value) => setForm({ ...form, minimumSellingPriceKgs: Number(value) })} disabled={!canManage} type="number" />
          <Field label={t('pricing.maximumDiscount')} value={form.maximumDiscountPercent} onChange={(value) => setForm({ ...form, maximumDiscountPercent: Number(value) })} disabled={!canManage} type="number" />
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">{t('pricing.reason')}</span>
            <textarea
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              disabled={!canManage}
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
              rows={3}
            />
          </label>
          {canManage ? (
            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:bg-blue-300">
                {saving ? t('common.loading') : t('common.save')}
              </button>
              {!isNew && policy?.status !== 'ACTIVE' ? (
                <button type="button" onClick={() => void activate()} className="rounded-xl border border-emerald-300 px-4 py-3 font-semibold text-emerald-700">
                  {t('pricing.activate')}
                </button>
              ) : null}
              {!isNew && policy?.status !== 'ARCHIVED' ? (
                <button type="button" onClick={() => void archive()} className="rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600">
                  {t('pricing.archive')}
                </button>
              ) : null}
            </div>
          ) : null}
        </form>

        {!isNew && policy?.history?.length ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('pricing.history')}</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('common.date')}</th>
                    <th className="px-4 py-3">{t('pricing.field')}</th>
                    <th className="px-4 py-3">{t('pricing.oldPrice')}</th>
                    <th className="px-4 py-3">{t('pricing.newPrice')}</th>
                    <th className="px-4 py-3">{t('pricing.changedBy')}</th>
                    <th className="px-4 py-3">{t('pricing.reason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {policy.history.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">{entry.fieldName}</td>
                      <td className="px-4 py-3">{entry.oldValue ?? '—'}</td>
                      <td className="px-4 py-3">{entry.newValue ?? '—'}</td>
                      <td className="px-4 py-3">{entry.changedBy?.fullName ?? '—'}</td>
                      <td className="px-4 py-3">{entry.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  required,
  type = 'text',
}: {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  required?: boolean;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        disabled={disabled}
        onChange={(event) => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 disabled:bg-slate-50"
      />
    </label>
  );
}
