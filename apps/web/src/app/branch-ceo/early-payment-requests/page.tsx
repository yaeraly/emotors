'use client';

import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { useTranslation } from '@/i18n/useTranslation';
import { apiFetch } from '@/lib/api';

import { toast } from '@/lib/toast';

type EarlyPaymentRequest = {
  id: string;
  orderNumber: string | null;
  paymentType: 'PARTIAL' | 'FULL';
  status: string;
  requestedAmount: number;
  approvedAmount: number | null;
  remainingDebt: number;
  requestComment?: string | null;
  financeAccount?: { name: string; availableBalance: number } | null;
  expectedCashboxBalanceAfterPayment?: number | null;
};

export default function BranchCeoEarlyPaymentsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<EarlyPaymentRequest[]>([]);
  const [error, setError] = useState('');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function load() {
    try {
      setRequests(await apiFetch<EarlyPaymentRequest[]>('/branch-ceo/early-payment-requests'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(id: string) {
    setError('');
    try {
      await apiFetch(`/branch-ceo/early-payment-requests/${id}/approve`, { method: 'POST' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    setError('');
    try {
      await apiFetch(`/branch-ceo/early-payment-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setRejectId(null);
      setRejectReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">Branch CEO</p>
          <h2 className="text-3xl font-bold">{t('branchCeo.earlyPaymentsTitle')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {requests.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-sm text-slate-600">{t('branchCeo.earlyPaymentsEmpty')}</p>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <article key={request.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
                <p className="font-bold">{request.orderNumber ?? request.id}</p>
                <p className="text-sm">
                  {t(`branchAccountant.earlyPaymentType.${request.paymentType}`)} · {formatKgs(request.requestedAmount)} ·{' '}
                  {t('finance.cashierBills.remainingDebt')}: {formatKgs(request.remainingDebt)}
                </p>
                {request.financeAccount ? (
                  <p className="text-sm text-slate-600">
                    {request.financeAccount.name}: {formatKgs(request.financeAccount.availableBalance)}
                    {request.expectedCashboxBalanceAfterPayment != null
                      ? ` → ${formatKgs(request.expectedCashboxBalanceAfterPayment)}`
                      : ''}
                  </p>
                ) : null}
                {request.requestComment ? <p className="text-sm text-slate-600">{request.requestComment}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void approve(request.id)} className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white">
                    {t('branchCeo.approveEarlyPayment')}
                  </button>
                  <button type="button" onClick={() => setRejectId(request.id)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                    {t('branchCeo.rejectEarlyPayment')}
                  </button>
                </div>
                {rejectId === request.id ? (
                  <div className="flex gap-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      placeholder={t('distribution.rejectionComment')}
                    />
                    <button type="button" onClick={() => void reject(request.id)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                      OK
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </ProtectedShell>
  );
}

function formatKgs(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} сом`;
}
