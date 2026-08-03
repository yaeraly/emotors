'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';
import type { FinanceTransfer } from '@/lib/types';

export default function BranchAccountantTransfersPage() {
  const { t } = useTranslation();
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rejectTarget, setRejectTarget] = useState<FinanceTransfer | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<FinanceTransfer[]>('/branch-accountant/transfers');
      setTransfers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approveTransfer(transfer: FinanceTransfer) {
    setProcessingId(transfer.id);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/branch-accountant/transfers/${transfer.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: transfer.version }),
      });
      setSuccess(t('branchAccountant.transferApproved'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setProcessingId(null);
    }
  }

  async function rejectTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejectTarget) return;
    setProcessingId(rejectTarget.id);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/branch-accountant/transfers/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({
          reason: rejectReason.trim(),
          expectedVersion: rejectTarget.version,
        }),
      });
      setRejectTarget(null);
      setRejectReason('');
      setSuccess(t('branchAccountant.transferRejected'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setProcessingId(null);
    }
  }

  const pendingTransfers = transfers.filter((transfer) => transfer.status === 'PENDING');
  const historyTransfers = transfers.filter((transfer) => transfer.status !== 'PENDING');

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchAccountant.section')}</p>
          <h2 className="text-3xl font-bold">{t('branchAccountant.accountTransfersReview')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <TransferTable
          title={t('branchAccountant.pendingTransfers')}
          transfers={pendingTransfers}
          loading={loading}
          emptyText={t('branchAccountant.emptyPendingTransfers')}
          t={t}
          onApprove={approveTransfer}
          onReject={setRejectTarget}
          processingId={processingId}
          showActions
        />

        <TransferTable
          title={t('branchAccountant.transferHistory')}
          transfers={historyTransfers}
          loading={loading}
          emptyText={t('branchAccountant.emptyTransferHistory')}
          t={t}
          processingId={processingId}
        />

        {rejectTarget ? (
          <form onSubmit={rejectTransfer} className="space-y-4 rounded-3xl border border-red-200 bg-red-50 p-6">
            <h3 className="text-lg font-bold">{t('branchAccountant.rejectTransfer')}</h3>
            <p className="text-sm text-slate-700">
              {rejectTarget.transferNumber}: {rejectTarget.sourceAccount.name} → {rejectTarget.destinationAccount.name}
            </p>
            <label className="block">
              <span className="text-sm font-semibold">{t('branchAccountant.rejectReason')}</span>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={processingId === rejectTarget.id}
                className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                {t('branchAccountant.rejectTransfer')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 font-semibold"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function TransferTable({
  title,
  transfers,
  loading,
  emptyText,
  t,
  onApprove,
  onReject,
  processingId,
  showActions = false,
}: {
  title: string;
  transfers: FinanceTransfer[];
  loading: boolean;
  emptyText: string;
  t: (key: string) => string;
  onApprove?: (transfer: FinanceTransfer) => void;
  onReject?: (transfer: FinanceTransfer) => void;
  processingId: string | null;
  showActions?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-bold">{title}</h3>
      </div>
      {loading ? (
        <p className="p-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : transfers.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-600">{emptyText}</p>
      ) : (
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('finance.transferNumber')}</th>
              <th className="px-4 py-3">{t('branchCashier.transferFromAccount')}</th>
              <th className="px-4 py-3">{t('branchCashier.transferToAccount')}</th>
              <th className="px-4 py-3">{t('branchCashier.transferAmount')}</th>
              <th className="px-4 py-3">{t('branchCashier.transferReason')}</th>
              <th className="px-4 py-3">{t('distribution.status')}</th>
              {showActions ? <th className="px-4 py-3">{t('common.actions')}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transfers.map((transfer) => (
              <tr key={transfer.id}>
                <td className="px-4 py-3 font-semibold">{transfer.transferNumber}</td>
                <td className="px-4 py-3">{transfer.sourceAccount.name}</td>
                <td className="px-4 py-3">{transfer.destinationAccount.name}</td>
                <td className="px-4 py-3">{formatKgs(transfer.amount)}</td>
                <td className="px-4 py-3">{transfer.reason ?? '—'}</td>
                <td className="px-4 py-3">
                  {t(`finance.transferStatus.${transfer.status}`)}
                </td>
                {showActions ? (
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={processingId === transfer.id}
                        onClick={() => onApprove?.(transfer)}
                        className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {t('branchAccountant.approveTransfer')}
                      </button>
                      <button
                        type="button"
                        disabled={processingId === transfer.id}
                        onClick={() => onReject?.(transfer)}
                        className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                      >
                        {t('branchAccountant.rejectTransfer')}
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
