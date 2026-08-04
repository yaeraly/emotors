'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal';
import { inventoryTypeLabel } from '@/lib/inventory-count';
import { apiFetch } from '@/lib/api';
import { canDeleteInventoryCount, isBranchOwnerUser } from '@/lib/rbac';
import { shouldHideInventoryCountFinancials } from '@/lib/inventory-count-discrepancy';
import { getStatusLabel } from '@/lib/translate-status';
import type { InventoryCountSession, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

const activeStatuses = new Set(['DRAFT', 'COUNTING', 'REJECTED']);
const historyStatuses = new Set(['SUBMITTED', 'APPROVED', 'COMPLETED']);

export function InventoryCountListContent({
  basePath = '/inventory/count',
  hideFinancials = false,
}: {
  basePath?: string;
  hideFinancials?: boolean;
}) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [sessions, setSessions] = useState<InventoryCountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<InventoryCountSession | null>(null);
  const [deleteRequireReason, setDeleteRequireReason] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [me, data] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<InventoryCountSession[]>('/inventory-count/sessions'),
      ]);
      setUser(me);
      setSessions(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('inventoryCount.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const activeSessions = sessions.filter((session) => activeStatuses.has(session.status));
  const historySessions = sessions.filter((session) => historyStatuses.has(session.status));
  const hideMonetaryFinancials = hideFinancials || shouldHideInventoryCountFinancials(user);
  const branchOwnerView = isBranchOwnerUser(user) && !hideFinancials;

  async function confirmDelete(reason?: string) {
    if (!deleteTarget) return;
    setDeleting(true);
    setLoadError('');
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
      setLoadError(message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void loadSessions()}
            className="mt-2 font-semibold text-red-800 underline"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}
      {successMessage ? (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</p>
      ) : null}

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-950">{t('inventoryCount.continueInventory')}</h3>
        {loading ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t('inventoryCount.loading')}
          </p>
        ) : activeSessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t('inventoryCount.noActiveSessions')}
          </p>
        ) : (
          <div className="grid gap-4">
            {activeSessions.map((session) => (
              <ActiveInventoryCard
                key={session.id}
                session={session}
                t={t}
                basePath={basePath}
                branchOwnerView={branchOwnerView}
                hideMonetaryFinancials={hideMonetaryFinancials}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-bold text-slate-950">{t('inventoryCount.inventoryHistory')}</h3>
        {loading ? (
          <HistoryTableSkeleton branchOwnerView={branchOwnerView} t={t} />
        ) : historySessions.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            {t('inventoryCount.noHistory')}
          </p>
        ) : (
          <SessionTable
            sessions={historySessions}
            t={t}
            user={user}
            branchOwnerView={branchOwnerView}
            basePath={basePath}
            onDelete={(session) => {
              setDeleteTarget(session);
              setDeleteRequireReason(true);
              setLoadError('');
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

function completionPercentage(session: InventoryCountSession) {
  const total = session.summary?.totalProducts ?? 0;
  const counted = session.summary?.countedProducts ?? 0;
  if (total <= 0) return 0;
  return Math.round((counted / total) * 100);
}

function ActiveInventoryCard({
  session,
  t,
  basePath,
  branchOwnerView,
  hideMonetaryFinancials,
}: {
  session: InventoryCountSession;
  t: (key: string) => string;
  basePath: string;
  branchOwnerView: boolean;
  hideMonetaryFinancials: boolean;
}) {
  const summary = session.summary;
  const progress = completionPercentage(session);
  const differencePositions = (summary?.shortages ?? 0) + (summary?.overages ?? 0);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-bold text-slate-950">{session.sessionNumber}</h4>
            <StatusBadge status={session.status} t={t} />
          </div>
          <p className="text-sm text-slate-600">
            {session.warehouse?.name ?? '—'}
            {session.startDate
              ? ` · ${new Date(session.startDate).toLocaleString()}`
              : ` · ${new Date(session.createdAt).toLocaleString()}`}
          </p>
          <p className="text-sm text-slate-500">
            {t('inventoryCount.createdBy')}: {session.createdBy?.fullName ?? '—'}
          </p>
        </div>
        <Link
          href={`${basePath}/${session.id}`}
          className="inline-flex h-fit shrink-0 items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t('inventoryCount.continueInventory')}
        </Link>
      </div>

      <div
        className={`mt-4 grid gap-3 sm:grid-cols-2 ${
          hideMonetaryFinancials ? 'lg:grid-cols-4 xl:grid-cols-5' : 'lg:grid-cols-4 xl:grid-cols-6'
        }`}
      >
        <Metric label={t('inventoryCount.totalProducts')} value={String(summary?.totalProducts ?? 0)} />
        <Metric label={t('inventoryCount.countedProducts')} value={String(summary?.countedProducts ?? 0)} />
        <Metric label={t('inventoryCount.remainingProducts')} value={String(summary?.remainingProducts ?? 0)} />
        <Metric label={t('inventoryCount.differencePositions')} value={String(differencePositions)} />
        <Metric label={t('inventoryCount.completionPercentage')} value={`${progress}%`} />
        {!hideMonetaryFinancials ? (
          <Metric
            label={t('inventoryCount.totalDifferenceValue')}
            value={Number(summary?.totalDifferenceValueKgs ?? 0).toFixed(2)}
          />
        ) : null}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function historyColumnCount(branchOwnerView: boolean) {
  return branchOwnerView ? 8 : 6;
}

function HistoryTableSkeleton({
  branchOwnerView,
  t,
}: {
  branchOwnerView: boolean;
  t: (key: string) => string;
}) {
  const colCount = historyColumnCount(branchOwnerView);

  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {Array.from({ length: colCount }).map((_, index) => (
              <th key={index} className="px-2 py-2">
                <span className="inline-block h-3 w-12 animate-pulse rounded bg-slate-200" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={colCount} className="px-2 py-6 text-center text-slate-500">
              {t('inventoryCount.loadingHistory')}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SessionTable({
  sessions,
  t,
  user,
  branchOwnerView,
  basePath,
  onDelete,
}: {
  sessions: InventoryCountSession[];
  t: (key: string) => string;
  user: User | null;
  branchOwnerView: boolean;
  basePath: string;
  onDelete: (session: InventoryCountSession) => void;
}) {
  const colCount = historyColumnCount(branchOwnerView);
  const headerClass = branchOwnerView ? 'px-2 py-2' : 'px-4 py-3';
  const cellClass = branchOwnerView ? 'px-2 py-2 whitespace-nowrap' : 'px-4 py-3';

  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className={`w-full divide-y divide-slate-200 text-sm ${branchOwnerView ? 'text-xs' : ''}`}>
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
            <tr>
              <th className={headerClass}>
                {branchOwnerView ? t('inventoryCount.col.number') : t('inventoryCount.sessionNumber')}
              </th>
              {!branchOwnerView ? <th className={headerClass}>{t('inventory.warehouse')}</th> : null}
              {branchOwnerView ? (
                <th className={headerClass}>{t('inventoryCount.col.started')}</th>
              ) : null}
              {branchOwnerView ? (
                <th className={headerClass}>{t('inventoryCount.col.completed')}</th>
              ) : null}
              {branchOwnerView ? (
                <th className={headerClass}>{t('inventoryCount.col.createdBy')}</th>
              ) : null}
              <th className={branchOwnerView ? `${headerClass} min-w-[5rem]` : headerClass}>
                {branchOwnerView ? t('inventoryCount.col.type') : t('inventoryCount.inventoryType')}
              </th>
              <th className={headerClass}>{t('common.status')}</th>
              <th className={headerClass}>
                {branchOwnerView ? t('inventoryCount.col.counted') : t('inventoryCount.countedProducts')}
              </th>
              {branchOwnerView ? (
                <th className={headerClass}>{t('inventoryCount.col.differenceValue')}</th>
              ) : null}
              {!branchOwnerView ? <th className={headerClass}>{t('common.createdDate')}</th> : null}
              <th className={headerClass}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <tr key={session.id}>
                <td className={`${cellClass} font-bold`}>{session.sessionNumber}</td>
                {!branchOwnerView ? <td className={cellClass}>{session.warehouse?.name}</td> : null}
                {branchOwnerView ? (
                  <td className={cellClass}>
                    {session.startDate
                      ? new Date(session.startDate).toLocaleString()
                      : new Date(session.createdAt).toLocaleString()}
                  </td>
                ) : null}
                {branchOwnerView ? (
                  <td className={cellClass}>
                    {session.completedAt
                      ? new Date(session.completedAt).toLocaleString()
                      : session.approvedAt
                        ? new Date(session.approvedAt).toLocaleString()
                        : session.finishDate
                          ? new Date(session.finishDate).toLocaleString()
                          : '—'}
                  </td>
                ) : null}
                {branchOwnerView ? (
                  <td className={`${cellClass} max-w-[8rem] truncate`}>
                    {session.createdBy?.fullName ?? '—'}
                  </td>
                ) : null}
                <td className={branchOwnerView ? `${cellClass} min-w-[5rem]` : cellClass}>
                  {inventoryTypeLabel(session.inventoryType, t)}
                </td>
                <td className={cellClass}>
                  <StatusBadge status={session.status} t={t} />
                </td>
                <td className={cellClass}>
                  {session.summary?.countedProducts ?? 0} / {session.summary?.totalProducts ?? 0}
                </td>
                {branchOwnerView ? (
                  <td className={`${cellClass} font-semibold`}>
                    {Number(session.summary?.totalDifferenceValueKgs ?? 0).toFixed(2)}
                  </td>
                ) : null}
                {!branchOwnerView ? (
                  <td className={cellClass}>{new Date(session.createdAt).toLocaleDateString()}</td>
                ) : null}
                <td className={cellClass}>
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`${basePath}/${session.id}`}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold"
                    >
                      {t('common.open')}
                    </Link>
                    {canDeleteInventoryCount(user) ? (
                      <button
                        type="button"
                        onClick={() => onDelete(session)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
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

      <div className="grid gap-3 md:hidden">
        {sessions.map((session) => (
          <article key={session.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-950">{session.sessionNumber}</p>
                {!branchOwnerView ? (
                  <p className="text-xs text-slate-500">{session.warehouse?.name}</p>
                ) : null}
              </div>
              <StatusBadge status={session.status} t={t} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {branchOwnerView ? (
                <>
                  <div>
                    <dt className="text-slate-400">{t('inventoryCount.col.started')}</dt>
                    <dd className="font-medium text-slate-800">
                      {session.startDate
                        ? new Date(session.startDate).toLocaleString()
                        : new Date(session.createdAt).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{t('inventoryCount.col.completed')}</dt>
                    <dd className="font-medium text-slate-800">
                      {session.completedAt
                        ? new Date(session.completedAt).toLocaleString()
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{t('inventoryCount.col.createdBy')}</dt>
                    <dd className="font-medium text-slate-800">{session.createdBy?.fullName ?? '—'}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt className="text-slate-400">{t('common.createdDate')}</dt>
                  <dd className="font-medium text-slate-800">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-slate-400">
                  {branchOwnerView ? t('inventoryCount.col.type') : t('inventoryCount.inventoryType')}
                </dt>
                <dd className="font-medium text-slate-800">
                  {inventoryTypeLabel(session.inventoryType, t)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{t('inventoryCount.col.counted')}</dt>
                <dd className="font-medium text-slate-800">
                  {session.summary?.countedProducts ?? 0} / {session.summary?.totalProducts ?? 0}
                </dd>
              </div>
              {branchOwnerView ? (
                <div>
                  <dt className="text-slate-400">{t('inventoryCount.col.differenceValue')}</dt>
                  <dd className="font-medium text-slate-800">
                    {Number(session.summary?.totalDifferenceValueKgs ?? 0).toFixed(2)}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`${basePath}/${session.id}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold"
              >
                {t('common.open')}
              </Link>
              {canDeleteInventoryCount(user) ? (
                <button
                  type="button"
                  onClick={() => onDelete(session)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700"
                >
                  {t('common.delete')}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
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
      {getStatusLabel({ module: 'inventoryCount', status, t })}
    </span>
  );
}
