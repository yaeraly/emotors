'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import type { BranchAccountBalance } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';

export default function BranchBalancesPage() {
  const { t } = useTranslation();
  const [balances, setBalances] = useState<BranchAccountBalance[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<BranchAccountBalance[]>('/distribution/branch-balances')
      .then(setBalances)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(distributionModuleTitleKey(null))}</p><h2 className="text-3xl font-bold">{t('distribution.branchBalances')}</h2></div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">{t('distribution.branch')}</th><th className="px-4 py-3">Region</th><th className="px-4 py-3">{t('distribution.totalDebt')}</th><th className="px-4 py-3">{t('distribution.totalPaid')}</th><th className="px-4 py-3">Last Payment</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{balances.map((balance) => <tr key={balance.branchId}><td className="px-4 py-3 font-bold">{balance.branch?.name}</td><td className="px-4 py-3">{balance.branch?.city}</td><td className="px-4 py-3">{formatKgs(balance.totalDebt)}</td><td className="px-4 py-3">{formatKgs(balance.totalPaid)}</td><td className="px-4 py-3">{balance.lastPaymentAt ? new Date(balance.lastPaymentAt).toLocaleDateString() : '-'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
