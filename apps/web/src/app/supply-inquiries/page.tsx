'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { canViewSupplyInquiries } from '@/lib/rbac';
import type { User } from '@/lib/types';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type SupplyInquiry = {
  id: string;
  inquiryNumber: string;
  status: string;
  priority: string;
  message: string;
  requestedQuantity: number;
  availableQuantity: number;
  unavailableQuantity: number;
  absenceReason?: string | null;
  responseComment?: string | null;
  expectedOrderDate?: string | null;
  expectedShipmentDate?: string | null;
  expectedArrivalDate?: string | null;
  procurementOrderId?: string | null;
  createdAt: string;
  respondedAt?: string | null;
  product: { id: string; sku: string; name: string };
  branchRequest: { id: string; requestNumber: string };
  createdBy: { fullName: string };
  respondedBy?: { fullName: string } | null;
};

const ABSENCE_REASONS = [
  'NOT_ORDERED',
  'ORDER_PLANNED',
  'ORDER_IN_PROGRESS',
  'SUPPLIER_DELAY',
  'PRODUCTION_DELAY',
  'TRANSPORT_DELAY',
  'CUSTOMS_DELAY',
  'RECEIVING_IN_PROGRESS',
  'PRODUCT_DISCONTINUED',
  'DEMAND_FORECAST_ERROR',
  'OTHER',
] as const;

export default function SupplyInquiriesPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [inquiries, setInquiries] = useState<SupplyInquiry[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseForm, setResponseForm] = useState({
    absenceReason: 'NOT_ORDERED',
    responseComment: '',
    expectedOrderDate: '',
    expectedShipmentDate: '',
    expectedArrivalDate: '',
    procurementOrderId: '',
  });

  const canView = canViewSupplyInquiries(user);

  async function load() {
    const [me, rows] = await Promise.all([
      apiFetch<User>('/auth/me'),
      apiFetch<SupplyInquiry[]>('/supply-inquiries'),
    ]);
    setUser(me);
    setInquiries(rows);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [t]);

  async function submitResponse(inquiryId: string) {
    setError('');
    try {
      await apiFetch(`/supply-inquiries/${inquiryId}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          absenceReason: responseForm.absenceReason,
          responseComment: responseForm.responseComment.trim() || undefined,
          expectedOrderDate: responseForm.expectedOrderDate || undefined,
          expectedShipmentDate: responseForm.expectedShipmentDate || undefined,
          expectedArrivalDate: responseForm.expectedArrivalDate || undefined,
          procurementOrderId: responseForm.procurementOrderId.trim() || undefined,
        }),
      });
      setSuccess(t('supplyInquiries.responseSent'));
      setRespondingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  }

  if (user && !canView) {
    return (
      <ProtectedShell>
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{t('common.forbiddenMessage')}</p>
      </ProtectedShell>
    );
  }

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">{t('supplyInquiries.subtitle')}</p>
          <h2 className="text-3xl font-bold text-slate-950">{t('supplyInquiries.title')}</h2>
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">{success}</p> : null}

        <div className="space-y-4">
          {inquiries.length === 0 ? (
            <p className="text-sm text-slate-500">{t('supplyInquiries.empty')}</p>
          ) : (
            inquiries.map((inquiry) => (
              <div key={inquiry.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">{inquiry.inquiryNumber}</p>
                    <p className="mt-1 font-semibold text-slate-900">{inquiry.product.name}</p>
                    <p className="text-xs text-slate-500">{inquiry.product.sku}</p>
                    <p className="mt-2 text-sm text-slate-600">
                      {t('supplyInquiries.branchRequest')}:{' '}
                      <Link href={`/branch-purchase-requests/${inquiry.branchRequest.id}`} className="text-blue-600">
                        {inquiry.branchRequest.requestNumber}
                      </Link>
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {t('branchProductRequest.requestedQuantity')}: {inquiry.requestedQuantity} ·{' '}
                      {t('branchProductRequest.availableQuantity')}: {inquiry.availableQuantity} ·{' '}
                      {t('branchProductRequest.missingQuantity')}: {inquiry.unavailableQuantity}
                    </p>
                    <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{inquiry.message}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {t('supplyInquiries.from')}: {inquiry.createdBy.fullName} · {new Date(inquiry.createdAt).toLocaleString()} · {inquiry.priority}
                    </p>
                    {inquiry.status === 'ANSWERED' ? (
                      <div className="mt-4 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
                        <p className="font-semibold">{translateStatus(t, inquiry.absenceReason ?? '', 'supplyAbsenceReason')}</p>
                        {inquiry.responseComment ? <p className="mt-1">{inquiry.responseComment}</p> : null}
                        {inquiry.respondedBy ? (
                          <p className="mt-2 text-xs">{inquiry.respondedBy.fullName} · {inquiry.respondedAt ? new Date(inquiry.respondedAt).toLocaleString() : ''}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {inquiry.status === 'OPEN' ? (
                    <button
                      type="button"
                      onClick={() => setRespondingId(inquiry.id)}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      {t('supplyInquiries.respond')}
                    </button>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {translateStatus(t, inquiry.status, 'supplyInquiry')}
                    </span>
                  )}
                </div>

                {respondingId === inquiry.id ? (
                  <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">{t('supplyInquiries.absenceReason')}</span>
                      <select
                        value={responseForm.absenceReason}
                        onChange={(event) => setResponseForm((current) => ({ ...current, absenceReason: event.target.value }))}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                      >
                        {ABSENCE_REASONS.map((reason) => (
                          <option key={reason} value={reason}>
                            {translateStatus(t, reason, 'supplyAbsenceReason')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">{t('supplyInquiries.comment')}</span>
                      <textarea
                        value={responseForm.responseComment}
                        onChange={(event) => setResponseForm((current) => ({ ...current, responseComment: event.target.value }))}
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">{t('supplyInquiries.expectedOrderDate')}</span>
                      <input type="date" value={responseForm.expectedOrderDate} onChange={(event) => setResponseForm((current) => ({ ...current, expectedOrderDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">{t('supplyInquiries.expectedShipmentDate')}</span>
                      <input type="date" value={responseForm.expectedShipmentDate} onChange={(event) => setResponseForm((current) => ({ ...current, expectedShipmentDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">{t('supplyInquiries.expectedArrivalDate')}</span>
                      <input type="date" value={responseForm.expectedArrivalDate} onChange={(event) => setResponseForm((current) => ({ ...current, expectedArrivalDate: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">{t('supplyInquiries.procurementOrderId')}</span>
                      <input value={responseForm.procurementOrderId} onChange={(event) => setResponseForm((current) => ({ ...current, procurementOrderId: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" />
                    </label>
                    <div className="flex gap-2 md:col-span-2">
                      <button type="button" onClick={() => setRespondingId(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold">
                        {t('common.cancel')}
                      </button>
                      <button type="button" onClick={() => void submitResponse(inquiry.id)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                        {t('common.send')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </ProtectedShell>
  );
}
