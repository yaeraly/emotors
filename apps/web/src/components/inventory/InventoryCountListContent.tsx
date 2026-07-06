'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { inventoryTypeLabel } from '@/lib/inventory-count';
import { apiFetch } from '@/lib/api';
import { canDeleteInventoryCount } from '@/lib/rbac';
import type { InventoryCountSession, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const activeStatuses = new Set(['DRAFT', 'COUNTING', 'REJECTED']);
const historyStatuses = new Set(['SUBMITTED', 'APPROVED', 'COMPLETED']);

export function InventoryCountListContent() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<InventoryCountSession[]>([]);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<InventoryCountSession | null>(null);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  async function loadSessions() {
    return apiFetch<InventoryCountSession[]>('/inventory-count/sessions').then(setSessions);
  }

  useEffect(() => {
    Promise.all([apiFetch<User>('/auth/me'), loadSessions()])
      .then(([me]) => setUser(me))
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const activeSessions = sessions.filter((session) => activeStatuses.has(session.status));
  const historySessions = sessions.filter((session) => historyStatuses.has(session.status));

  async function confirmDelete(reason?: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    try {
      const result = await apiFetch<{ archived?: boolean }>(`/inventory-count/sessions/${deleteTarget.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      });
      setDeleteTarget(null);
      setSuccessMessage(result.archived ? t('inventoryCount.archivedSuccess') : t('inventoryCount.deletedSuccess'));
      await loadSessions();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('common.error');
      if (message.toLowerCase().includes('reason is required')) {
        setDeleteRequireReason(true);
      }
      setError(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {successMessage ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</p> : null}

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-950">{t('inventoryCount.continueInventory')}</h3>
        {activeSessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t('inventoryCount.noActiveSessions')}
          </p>
        ) : (
          <SessionTable
            sessions={activeSessions}
            t={t}
            user={user}
            onDelete={(session) => {
              setDeleteTarget(session);
              setDeleteRequireReason(!['DRAFT', 'COUNTING'].includes(session.status));
              setError('');
            }}
          />
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-950">{t('inventoryCount.inventoryHistory')}</h3>
        {historySessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t('inventoryCount.noHistory')}
          </p>
        ) : (
          <SessionTable
            sessions={historySessions}
            t={t}
            user={user}
            onDelete={(session) => {
              setDeleteTarget(session);
              setDeleteRequireReason(true);
              setError('');
            }}
          />
        )}
      </section>

      <DeleteConfirmModal
        open={!!deleteTarget}
        title={t('common.deleteConfirmTitle')}
        message={t('common.deleteConfirmMessage')}
        requireReason={deleteRequireReason}
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function SessionTable({
  sessions,
  t,
  user,
  onDelete,
}: {
  sessions: InventoryCountSession[];
  t: (key: string) => string;
  user: User | null;
  onDelete: (session: InventoryCountSession) => void;
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
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/inventory/count/${session.id}`}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                  >
                    {t('common.open')}
                  </Link>
                  {canDeleteInventoryCount(user) ? (
                    <button
                      type="button"
                      onClick={() => onDelete(session)}
                      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
                    >
                      {t('common.delete')}
                    </button>
                  ) : null}
                </div>
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
    ARCHIVED: 'bg-slate-200 text-slate-600',
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[status]}`}>
      {t(`inventoryCount.status.${status}`)}
    </span>
  );
}
