'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canDispatchFromHq } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

type PickingTask = {
  id: string;
  status: string;
  assignedAt: string;
  distributionOrder: {
    id: string;
    orderNumber: string;
    status: string;
    branch?: { name: string };
    items?: Array<{ sku: string; productName: string; quantity: number }>;
  };
  sourceHqWarehouse?: { name: string };
};

export default function PickingTasksPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<PickingTask[]>('/distribution/picking-tasks'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([result, me]) => {
        setTasks(result);
        setUser(me);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  if (!canDispatchFromHq(user) && user) {
    return (
      <ProtectedShell>
        <p className="p-6 text-red-600">{t('common.forbidden')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('hqWarehouse.title')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('distribution.pickingTasks')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('distribution.orderNumber')}</th>
                <th className="px-4 py-3">{t('distribution.branch')}</th>
                <th className="px-4 py-3">{t('distribution.sourceWarehouse')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3 font-bold">{task.distributionOrder.orderNumber}</td>
                  <td className="px-4 py-3">{task.distributionOrder.branch?.name}</td>
                  <td className="px-4 py-3">{task.sourceHqWarehouse?.name}</td>
                  <td className="px-4 py-3">
                    {getStatusLabel({ module: 'pickingTask', status: task.status, t })} /{' '}
                    {getStatusLabel({ module: 'distribution', status: task.distributionOrder.status, t })}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/distribution/orders/${task.distributionOrder.id}`} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
                      {t('common.open')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
