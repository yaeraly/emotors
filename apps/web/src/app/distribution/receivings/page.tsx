'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { HqSalesBranchOrdersNav } from '@/components/HqSalesBranchOrdersNav';
import { apiFetch } from '@/lib/api';
import type { GoodsReceiving } from '@/lib/types';
import { distributionModuleTitleKey } from '@/lib/distribution-labels';
import { useTranslation } from '@/i18n/useTranslation';

export default function ReceivingsPage() {
  const { t } = useTranslation();
  const [receivings, setReceivings] = useState<GoodsReceiving[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<GoodsReceiving[]>('/distribution/receivings')
      .then(setReceivings)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <HqSalesBranchOrdersNav />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t(distributionModuleTitleKey(null))}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('distribution.receiveGoods')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="h-[calc(100vh-240px)] min-h-96 overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('distribution.receivingNumber')}</th>
                <th className="px-4 py-3">{t('distribution.orderNumber')}</th>
                <th className="px-4 py-3">{t('distribution.branch')}</th>
                <th className="px-4 py-3">{t('inventory.warehouse')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('distribution.receivedBy')}</th>
                <th className="px-4 py-3">{t('distribution.receivedAt')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receivings.map((receiving) => (
                <tr key={receiving.id}>
                  <td className="px-4 py-3 font-bold">{receiving.receivingNumber}</td>
                  <td className="px-4 py-3">{receiving.distributionOrder?.orderNumber}</td>
                  <td className="px-4 py-3">{receiving.branch?.name}</td>
                  <td className="px-4 py-3">{receiving.warehouse?.name}</td>
                  <td className="px-4 py-3">{receiving.status}</td>
                  <td className="px-4 py-3">{receiving.receivedBy?.fullName}</td>
                  <td className="px-4 py-3">{new Date(receiving.receivedAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><Link href={`/distribution/receivings/${receiving.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">{t('common.open')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
