'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import {
  canApproveSaleInstallmentRequest,
  canCancelSaleInstallmentRequest,
} from '@/lib/rbac';
import { customerTypeLabelKey } from '@/lib/sale-customer-pricing';
import {
  canBranchCeoCancelInstallmentRequest,
  isPendingBranchCeoInstallmentDecision,
} from '@/lib/sale-installment';
import type { Sale, SaleInstallmentApproval, SaleInstallmentApprovalStatus, User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getStatusLabel } from '@/lib/translate-status';

type InstallmentRequestRow = SaleInstallmentApproval & {
  sale: Pick<Sale, 'id' | 'receiptNumber' | 'totalAmount' | 'paidAmount' | 'debtAmount' | 'status' | 'paymentStatus'> & {
    customer: { id: string; fullName: string; phone: string; customerType?: string };
    seller: { id: string; fullName: string };
    branch?: { id: string; name: string; code: string };
    installments?: Array<{ dueDate: string; amount: number; paidAmount: number }>;
  };
};

const STATUS_FILTERS: Array<SaleInstallmentApprovalStatus | 'ALL'> = [
  'ALL',
  'PENDING_BRANCH_CEO_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];

function formatKgs(value: number) {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KGS`;
}

function buildQuery(search: string, status: string, from: string, to: string) {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  if (status && status !== 'ALL') params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export default function SaleInstallmentRequestsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [requests, setRequests] = useState<InstallmentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [actingSaleId, setActingSaleId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<'reject' | 'cancel' | null>(null);

  const canReview = canApproveSaleInstallmentRequest(user);
  const canCancel = canCancelSaleInstallmentRequest(user);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId],
  );

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const [me, rows] = await Promise.all([
        apiFetch<User>('/auth/me'),
        apiFetch<InstallmentRequestRow[]>(
          `/sales/installment-requests${buildQuery(search, statusFilter, fromDate, toDate)}`,
        ),
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

  async function approveRequest(saleId: string) {
    setActingSaleId(saleId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/approve`, {
        method: 'POST',
        body: JSON.stringify({
          approvalComment: approvalComment.trim() || undefined,
        }),
      });
      setSuccess(t('sales.installmentRequestApproved'));
      setApprovalComment('');
      setActionMode(null);
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
      setRejectionReason('');
      setActionMode(null);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActingSaleId(null);
    }
  }

  async function cancelRequest(saleId: string) {
    if (!cancellationReason.trim()) {
      setError(t('sales.installmentCancellationReasonRequired'));
      return;
    }

    setActingSaleId(saleId);
    setError('');
    setSuccess('');
    try {
      await apiFetch(`/sales/${saleId}/installment-request/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancellationReason: cancellationReason.trim() }),
      });
      setSuccess(t('sales.installmentRequestCancelled'));
      setCancellationReason('');
      setActionMode(null);
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setActingSaleId(null);
    }
  }

  const selectedPending = selectedRequest
    ? isPendingBranchCeoInstallmentDecision(selectedRequest.status)
    : false;
  const selectedCancellable = selectedRequest
    ? canBranchCeoCancelInstallmentRequest(selectedRequest, selectedRequest.sale)
    : false;

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

        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">{t('common.search')}</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">{t('common.status')}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {STATUS_FILTERS.map((status) => (
                <option key={status} value={status}>
                  {status === 'ALL'
                    ? t('common.all')
                    : getStatusLabel({ module: 'installmentApproval', status, t })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">{t('common.from')}</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-slate-500">{t('common.to')}</span>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="md:col-span-4">
            <button
              type="button"
              onClick={() => void loadRequests()}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('common.apply')}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null}
        {success ? (
          <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            {success}
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('sales.receiptNumber')}</th>
                  <th className="px-4 py-3">{t('sales.customer')}</th>
                  <th className="px-4 py-3">{t('customers.customerType')}</th>
                  <th className="px-4 py-3">{t('sales.totalAmount')}</th>
                  <th className="px-4 py-3">{t('sales.downPayment')}</th>
                  <th className="px-4 py-3">{t('sales.installmentRemainingDebt')}</th>
                  <th className="px-4 py-3">{t('sales.installmentTerm')}</th>
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
                    <tr
                      key={request.id}
                      className={`border-t border-slate-100 ${selectedId === request.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {request.sale.receiptNumber}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{request.sale.customer.fullName}</p>
                        <p className="text-xs text-slate-500">{request.sale.customer.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        {request.sale.customer.customerType
                          ? t(customerTypeLabelKey(request.sale.customer.customerType))
                          : '—'}
                      </td>
                      <td className="px-4 py-3">{formatKgs(request.totalAmount)}</td>
                      <td className="px-4 py-3">
                        {formatKgs(request.downPayment ?? request.initialPayment)}
                      </td>
                      <td className="px-4 py-3">
                        {formatKgs(request.remainingDebt ?? request.financedAmount)}
                      </td>
                      <td className="px-4 py-3">
                        {request.dueDate
                          ? new Date(request.dueDate).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {request.submittedAt
                          ? new Date(request.submittedAt).toLocaleString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusLabel({ module: 'installmentApproval', status: request.status, t })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(request.id);
                              setActionMode(null);
                              setApprovalComment('');
                              setRejectionReason('');
                              setCancellationReason('');
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {t('common.open')}
                          </button>
                          <Link
                            href={`/sales/${request.sale.id}`}
                            className="rounded-lg border border-blue-200 px-3 py-1 text-center text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            {t('sales.title')}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">{t('sales.installmentRequestDetails')}</h3>
            {!selectedRequest ? (
              <p className="mt-4 text-sm text-slate-500">{t('sales.noInstallmentRequests')}</p>
            ) : (
              <div className="mt-4 space-y-3 text-sm">
                <Detail label={t('crm.branch')} value={selectedRequest.sale.branch?.name ?? '—'} />
                <Detail label={t('sales.receiptNumber')} value={selectedRequest.sale.receiptNumber} />
                <Detail label={t('sales.customer')} value={selectedRequest.sale.customer.fullName} />
                <Detail
                  label={t('customers.customerType')}
                  value={
                    selectedRequest.sale.customer.customerType
                      ? t(customerTypeLabelKey(selectedRequest.sale.customer.customerType))
                      : '—'
                  }
                />
                <Detail label={t('sales.totalAmount')} value={formatKgs(selectedRequest.totalAmount)} />
                <Detail
                  label={t('sales.downPayment')}
                  value={formatKgs(selectedRequest.downPayment ?? selectedRequest.initialPayment)}
                />
                <Detail
                  label={t('sales.installmentRemainingDebt')}
                  value={formatKgs(selectedRequest.remainingDebt ?? selectedRequest.financedAmount)}
                />
                <Detail
                  label={t('sales.installmentTerm')}
                  value={
                    selectedRequest.dueDate
                      ? new Date(selectedRequest.dueDate).toLocaleDateString()
                      : '—'
                  }
                />
                <Detail label={t('sales.branchSalesComment')} value={selectedRequest.notes?.trim() || '—'} />
                <Detail
                  label={t('sales.sentForApprovalAt')}
                  value={
                    selectedRequest.submittedAt
                      ? new Date(selectedRequest.submittedAt).toLocaleString()
                      : '—'
                  }
                />
                <Detail
                  label={t('common.status')}
                  value={getStatusLabel({
                    module: 'installmentApproval',
                    status: selectedRequest.status,
                    t,
                  })}
                />
                {selectedRequest.rejectionReason ? (
                  <Detail
                    label={
                      selectedRequest.status === 'CANCELLED'
                        ? t('sales.installmentCancellationReason')
                        : t('sales.installmentRejectionReason')
                    }
                    value={selectedRequest.rejectionReason}
                  />
                ) : null}

                {selectedRequest.sale.installments?.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      {t('sales.installmentPaymentSchedule')}
                    </p>
                    <ul className="mt-2 space-y-1 text-slate-700">
                      {selectedRequest.sale.installments.map((installment, index) => (
                        <li key={`${installment.dueDate}-${index}`}>
                          {new Date(installment.dueDate).toLocaleDateString()} —{' '}
                          {formatKgs(installment.amount)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {canReview && selectedPending ? (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        {t('sales.installmentApprovalComment')}
                      </span>
                      <textarea
                        value={approvalComment}
                        onChange={(event) => setApprovalComment(event.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={actingSaleId === selectedRequest.sale.id}
                      onClick={() => void approveRequest(selectedRequest.sale.id)}
                      className="w-full rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {t('sales.approveInstallment')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionMode(actionMode === 'reject' ? null : 'reject')}
                      className="w-full rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      {t('sales.rejectInstallment')}
                    </button>
                    {actionMode === 'reject' ? (
                      <div className="space-y-2">
                        <textarea
                          value={rejectionReason}
                          onChange={(event) => setRejectionReason(event.target.value)}
                          placeholder={t('sales.installmentRejectionReason')}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={actingSaleId === selectedRequest.sale.id}
                          onClick={() => void rejectRequest(selectedRequest.sale.id)}
                          className="w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {t('sales.confirmRejectInstallment')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {canCancel && selectedCancellable ? (
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={() => setActionMode(actionMode === 'cancel' ? null : 'cancel')}
                      className="w-full rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
                    >
                      {t('sales.cancelInstallment')}
                    </button>
                    {actionMode === 'cancel' ? (
                      <div className="space-y-2">
                        <textarea
                          value={cancellationReason}
                          onChange={(event) => setCancellationReason(event.target.value)}
                          placeholder={t('sales.installmentCancellationReason')}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={actingSaleId === selectedRequest.sale.id}
                          onClick={() => void cancelRequest(selectedRequest.sale.id)}
                          className="w-full rounded-xl bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
                        >
                          {t('sales.confirmCancelInstallment')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        </div>
      </section>
    </ProtectedShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  );
}
