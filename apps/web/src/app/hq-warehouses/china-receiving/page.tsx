'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type ChinaReceivingTask = {
  id: string;
  orderNumber: string;
  supplier?: { name: string } | null;
  factory?: { name: string } | null;
  hqWarehouse?: { id: string; name: string; code: string } | null;
  status: string;
  arrivalDate?: string | null;
};

export default function ChinaReceivingListPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ChinaReceivingTask[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const successMessage = window.localStorage.getItem('emotors_china_receiving_success');
    if (successMessage) {
      setSuccess(successMessage);
      window.localStorage.removeItem('emotors_china_receiving_success');
    }

    apiFetch<ChinaReceivingTask[]>('/procurement/china-receiving')
      .then((list) => setTasks(list))
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('chinaReceiving.title')}</h2>
          <p className="mt-2 text-sm text-slate-500">{t('chinaReceiving.listDescription')}</p>
        </div>

        {success ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('chinaReceiving.orderNumber')}</th>
                <th className="px-4 py-3">{t('procurement.orders.supplier')}</th>
                <th className="px-4 py-3">{t('procurement.orders.factory')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.targetWarehouse')}</th>
                <th className="px-4 py-3">{t('chinaReceiving.arrivalDate')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3 font-bold">{task.orderNumber}</td>
                  <td className="px-4 py-3">{task.supplier?.name ?? '-'}</td>
                  <td className="px-4 py-3">{task.factory?.name ?? '-'}</td>
                  <td className="px-4 py-3">{task.hqWarehouse?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    {task.arrivalDate ? new Date(task.arrivalDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3">{translateStatus(t, task.status, 'procurement')}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/hq-warehouses/china-receiving/${task.id}`}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                    >
                      {t('common.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{t('chinaReceiving.empty')}</p>
          ) : null}
        </div>
      </section>
    </ProtectedShell>
  );
}
