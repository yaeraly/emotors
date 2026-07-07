'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canManagePricingPolicy } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type PricingPolicy = {
  id: string;
  sku: string;
  productName?: string | null;
  wholesalePriceKgs: number;
  hqBranchWholesalePriceKgs: number;
  recommendedRetailPriceKgs: number;
  minimumSellingPriceKgs: number;
  maximumDiscountPercent: number;
  status: string;
  updatedAt: string;
};

export default function PricingPage() {
  const { t } = useTranslation();
  const [policies, setPolicies] = useState<PricingPolicy[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([apiFetch<PricingPolicy[]>('/pricing/policies'), apiFetch<User>('/auth/me')])
      .then(([list, me]) => {
        setPolicies(list);
        setUser(me);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const canManage = canManagePricingPolicy(user);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('pricing.subtitle')}</p>
            <h2 className="text-3xl font-bold text-slate-950">{t('pricing.title')}</h2>
          </div>
          {canManage ? (
            <Link href="/pricing/new" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">
              {t('pricing.createPolicy')}
            </Link>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.product')}</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">{t('pricing.wholesalePrice')}</th>
                <th className="px-4 py-3">{t('pricing.hqBranchWholesalePrice')}</th>
                <th className="px-4 py-3">{t('pricing.recommendedRetailPrice')}</th>
                <th className="px-4 py-3">{t('pricing.minimumSellingPrice')}</th>
                <th className="px-4 py-3">{t('pricing.maximumDiscount')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">{t('pricing.empty')}</td>
                </tr>
              ) : (
                policies.map((policy) => (
                  <tr key={policy.id}>
                    <td className="px-4 py-3 font-semibold">{policy.productName ?? policy.sku}</td>
                    <td className="px-4 py-3">{policy.sku}</td>
                    <td className="px-4 py-3">{Number(policy.wholesalePriceKgs).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(policy.hqBranchWholesalePriceKgs).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(policy.recommendedRetailPriceKgs).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(policy.minimumSellingPriceKgs).toFixed(2)}</td>
                    <td className="px-4 py-3">{Number(policy.maximumDiscountPercent).toFixed(2)}%</td>
                    <td className="px-4 py-3">{translateStatus(t, policy.status)}</td>
                    <td className="px-4 py-3">
                      <Link href={`/pricing/${policy.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold">
                        {canManage ? t('common.edit') : t('common.open')}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
