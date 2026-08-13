'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type BranchWarehouseRequest = {
  id: string;
  requestNumber: string;
  status: string;
  branchDisplayStatus?: string;
  createdAt: string;
  itemCount: number;
  totalQuantity: number;
  approvedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  orderNumber?: string | null;
  orderId?: string | null;
  orderStatus?: string | null;
};

const STATUS_OPTIONS = [
  '',
  'DRAFT',
  'PENDING_HQ_REVIEW',
  'HQ_APPROVED',
  'PARTIALLY_APPROVED',
  'BRANCH_CONFIRMED',
  'WAITING_FOR_PAYMENT',
  'PAID',
  'READY_FOR_HQ_WAREHOUSE',
  'PICKING',
  'PACKED',
  'DISPATCHED',
  'RECEIVING',
  'RECEIVED',
  'RECEIVED_WITH_DIFFERENCE',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

export default function BranchWarehouseRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<BranchWarehouseRequest[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<BranchWarehouseRequest[]>('/branch-warehouse/requests')
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return requests.filter((request) => {
      if (status && request.status !== status && request.branchDisplayStatus !== status) return false;
      if (!query) return true;
      return (
        request.requestNumber.toLowerCase().includes(query) ||
        (request.orderNumber ?? '').toLowerCase().includes(query)
      );
    });
  }, [requests, search, status]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('branchWarehouseOperator.requests')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('branchWarehouseOperator.requestsTitle')}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('common.search')}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
          >
            <option value="">{t('branches.allStatuses')}</option>
            {STATUS_OPTIONS.filter(Boolean).map((value) => (
              <option key={value} value={value}>
                {translateStatus(t, value, 'branchRequest')}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('branchWarehouseOperator.requestNumber')}</th>
                <th className="px-4 py-3">{t('common.createdDate')}</th>
                <th className="px-4 py-3">{t('distribution.status')}</th>
                <th className="px-4 py-3">{t('branchWarehouseOperator.positions')}</th>
                <th className="px-4 py-3">{t('distribution.quantity')}</th>
                <th className="px-4 py-3">{t('branchWarehouseOperator.approved')}</th>
                <th className="px-4 py-3">{t('branchWarehouseOperator.sent')}</th>
                <th className="px-4 py-3">{t('branchWarehouseOperator.received')}</th>
                <th className="px-4 py-3">{t('distribution.orderNumber')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((request) => (
                <tr key={request.id} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/branch-warehouse/requests/${request.id}`} className="font-semibold text-blue-700">
                      {request.requestNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{new Date(request.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {translateStatus(t, request.branchDisplayStatus ?? request.status, 'branchRequest')}
                  </td>
                  <td className="px-4 py-3">{request.itemCount}</td>
                  <td className="px-4 py-3">{request.totalQuantity}</td>
                  <td className="px-4 py-3">{request.approvedQuantity}</td>
                  <td className="px-4 py-3">{request.sentQuantity}</td>
                  <td className="px-4 py-3">{request.receivedQuantity}</td>
                  <td className="px-4 py-3">{request.orderNumber ?? '—'}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    {t('procurement.dashboard.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </ProtectedShell>
  );
}
