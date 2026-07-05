'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { ModuleSectionNav } from '@/components/ModuleSectionNav';
import { warehouseHubSections } from '@/lib/scm-hub-sections';
import { apiFetch } from '@/lib/api';
import { canManageInventoryCount } from '@/lib/rbac';
import type { InventoryCountSession, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const activeStatuses = new Set(['DRAFT', 'COUNTING', 'REJECTED']);
const historyStatuses = new Set(['SUBMITTED', 'APPROVED', 'COMPLETED']);

export default function InventoryCountListPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<InventoryCountSession[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<InventoryCountSession[]>('/inventory-count/sessions'),
      apiFetch<User>('/auth/me'),
    ])
      .then(([result, me]) => {
        setSessions(result);
        setCurrentUser(me);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const activeSessions = sessions.filter((session) => activeStatuses.has(session.status));
  const historySessions = sessions.filter((session) => historyStatuses.has(session.status));
  const canManage = canManageInventoryCount(currentUser);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              {t('inventory.title')}
            </p>
            <h2 className="text-3xl font-bold text-slate-950">{t('inventoryCount.title')}</h2>
            <p className="mt-2 text-slate-500">{t('inventoryCount.subtitle')}</p>
          </div>
          {canManage ? (
            <Link
              href="/inventory/count/new"
              className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              {t('inventoryCount.newInventory')}
            </Link>
          ) : null}
        </div>

        <ModuleSectionNav sections={warehouseHubSections} />

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

        <section className="space-y-4">
          <h3 className="text-lg font-bold text-slate-950">{t('inventoryCount.continueInventory')}</h3>
          {activeSessions.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              {t('inventoryCount.noActiveSessions')}
            </p>
          ) : (
            <SessionTable sessions={activeSessions} t={t} />
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-bold text-slate-950">{t('inventoryCount.inventoryHistory')}</h3>
          {historySessions.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              {t('inventoryCount.noHistory')}
            </p>
          ) : (
            <SessionTable sessions={historySessions} t={t} />
          )}
        </section>
      </section>
    </ProtectedShell>
  );
}

function SessionTable({
  sessions,
  t,
}: {
  sessions: InventoryCountSession[];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">{t('inventoryCount.sessionNumber')}</th>
            <th className="px-4 py-3">{t('inventory.warehouse')}</th>
            <th className="px-4 py-3">{t('inventoryCount.inventoryType')}</th>
            <th className="px-4 py-3">{t('inventoryCount.status')}</th>
            <th className="px-4 py-3">{t('inventoryCount.countedProducts')}</th>
            <th className="px-4 py-3">{t('common.createdDate')}</th>
            <th className="px-4 py-3">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <tr key={session.id}>
              <td className="px-4 py-3 font-bold">{session.sessionNumber}</td>
              <td className="px-4 py-3">{session.warehouse?.name}</td>
              <td className="px-4 py-3">{inventoryTypeLabel(session.inventoryType, t)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={session.status} t={t} />
              </td>
              <td className="px-4 py-3">
                {session.summary?.countedProducts ?? 0} / {session.summary?.totalProducts ?? 0}
              </td>
              <td className="px-4 py-3">{new Date(session.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/inventory/count/${session.id}`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  {t('common.open')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: InventoryCountSession['status'];
  t: (key: string) => string;
}) {
  const colors: Record<InventoryCountSession['status'], string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    COUNTING: 'bg-blue-100 text-blue-800',
    SUBMITTED: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-emerald-100 text-emerald-800',
    REJECTED: 'bg-red-100 text-red-800',
    COMPLETED: 'bg-emerald-100 text-emerald-900',
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[status]}`}>
      {t(`inventoryCount.status.${status}`)}
    </span>
  );
}

import { inventoryTypeLabel } from '@/lib/inventory-count';