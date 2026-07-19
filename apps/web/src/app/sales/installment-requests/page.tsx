'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canApproveSaleInstallmentRequest } from '@/lib/rbac';
import type { Sale, SaleInstallmentApproval, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';

type InstallmentRequestRow = SaleInstallmentApproval & {
  sale: Pick<Sale, 'id' | 'receiptNumber' | 'totalAmount' | 'paidAmount' | 'debtAmount'> & {
    customer: { id: string; fullName: string; phone: string };
    seller: { id: string; fullName: string };
  };
};

function formatKgs(value: number) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS`;
}

function translateStatus(t: (key: string) => string, status: string) {
  switch (status) {
    case 'PENDING_BRANCH_CEO_APPROVAL':
      return t('sales.installmentPendingCeo');
    case 'APPROVED':
      return t('sales.installmentApproved');
    case 'REJECTED':
      return t('sales.installmentRejected');
    default:
      return status;
  }
}

export default function SaleInstallmentRequestsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<InstallmentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actingSaleId, setActingSaleId] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const [me, rows] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<InstallmentRequestRow[]>('/sales/installment-requests'),
      ]);
      setUser(me);
      setRequests(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canReview = canApproveSaleInstallmentRequest(user);

  async function approveRequest(saleId: string) {
    setActingSaleId(saleId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/approve`, { method: 'POST' });
      setSuccess(t('sales.installmentRequestApproved'));
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActingSaleId(null);
    }
  }

  async function rejectRequest(saleId: string) {
    if (!rejectionReason.trim()) {
      setError(t('sales.installmentRejectionReasonRequired'));
      return;
    }

    setActingSaleId(saleId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      setSuccess(t('sales.installmentRequestRejected'));
      setRejectingId(null);
      setRejectionReason('');
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActingSaleId(null);
    }
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
            {t('nav.sales')}
          </p>
          <h2 className="text-3xl font-bold text-slate-950">{t('sales.installmentRequestsTitle')}</h2>
          <p className="mt-2 text-slate-500">{t('sales.installmentRequestsHint')}</p>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {success}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('sales.installmentRequestNumber')}</th>
                <th className="px-4 py-3">{t('sales.customer')}</th>
                <th className="px-4 py-3">{t('sales.seller')}</th>
                <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                <th className="px-4 py-3">{t('sales.installmentInitialPayment')}</th>
                <th className="px-4 py-3">{t('sales.installmentFinancedAmount')}</th>
                <th className="px-4 py-3">{t('sales.installment')}</th>
                <th className="px-4 py-3">{t('sales.sentForApprovalAt')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                    {t('sales.noInstallmentRequests')}
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-900">{request.requestNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{request.sale.customer.fullName}</p>
                      <p className="text-xs text-slate-500">{request.sale.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">{request.submittedBy?.fullName ?? request.sale.seller.fullName}</td>
                    <td className="px-4 py-3">{formatKgs(request.totalAmount)}</td>
                    <td className="px-4 py-3">{formatKgs(request.initialPayment)}</td>
                    <td className="px-4 py-3">{formatKgs(request.financedAmount)}</td>
                    <td className="px-4 py-3">
                      {request.installmentDays
                        ? `${request.installmentDays} ${t('common.days')}`
                        : '—'}
                      <span className="block text-xs text-slate-500">
                        {request.paymentCount} {t('sales.paymentsCount')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {request.submittedAt
                        ? new Date(request.submittedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{translateStatus(t, request.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/sales/${request.sale.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {t('common.open')}
                        </Link>
                        {canReview && request.status === 'PENDING_BRANCH_CEO_APPROVAL' ? (
                          <>
                            <button
                              type="button"
                              disabled={actingSaleId === request.sale.id}
                              onClick={() => void approveRequest(request.sale.id)}
                              className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {t('sales.approveInstallment')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingId(request.id);
                                setRejectionReason('');
                              }}
                              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              {t('sales.rejectInstallment')}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {rejectingId === request.id ? (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={rejectionReason}
                            onChange={(event) => setRejectionReason(event.target.value)}
                            placeholder={t('sales.installmentRejectionReason')}
                            className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            disabled={actingSaleId === request.sale.id}
                            onClick={() => void rejectRequest(request.sale.id)}
                            className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {t('sales.confirmRejectInstallment')}
                          </button>
                        </div>
                      ) : null}
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
