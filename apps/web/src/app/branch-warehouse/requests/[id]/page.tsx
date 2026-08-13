'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProtectedShell } from '@/components/ProtectedShell';
import { apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { translateStatus } from '@/lib/translate-status';

type RequestItem = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  approvedQuantity: number | null;
  lineStatus: string | null;
  unit: string;
  note: string | null;
};

type BranchWarehouseRequestDetail = {
  id: string;
  requestNumber: string;
  status: string;
  branchDisplayStatus?: string;
  createdAt: string;
  note: string | null;
  itemCount: number;
  totalQuantity: number;
  approvedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  orderNumber?: string | null;
  orderId?: string | null;
  orderStatus?: string | null;
  items: RequestItem[];
};

export default function BranchWarehouseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [request, setRequest] = useState<BranchWarehouseRequestDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<BranchWarehouseRequestDetail>(`/branch-warehouse/requests/${id}`)
      .then(setRequest)
      .catch((err) => setError(err instanceof Error ? err.message : t('common.error')));
  }, [id, t]);

  return (
    <ProtectedShell>
      <section className="space-y-6">
        <div>
          <Link href="/branch-warehouse/requests" className="text-sm font-semibold text-blue-600">
            ← {t('branchWarehouseOperator.requests')}
          </Link>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{request?.requestNumber ?? '—'}</h2>
        </div>
        {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {request ? (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-4">
                <Info label={t('distribution.status')} value={translateStatus(t, request.branchDisplayStatus ?? request.status, 'branchRequest')} />
                <Info label={t('common.createdDate')} value={new Date(request.createdAt).toLocaleString()} />
                <Info label={t('distribution.orderNumber')} value={request.orderNumber ?? '—'} />
                <Info label={t('distribution.quantity')} value={String(request.totalQuantity)} />
                <Info label={t('branchWarehouseOperator.approved')} value={String(request.approvedQuantity)} />
                <Info label={t('branchWarehouseOperator.sent')} value={String(request.sentQuantity)} />
                <Info label={t('branchWarehouseOperator.received')} value={String(request.receivedQuantity)} />
              </div>
              {request.note ? <p className="mt-4 text-sm text-slate-600">{request.note}</p> : null}
            </section>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold">{t('distribution.items')}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">{t('sales.product')}</th>
                      <th className="px-4 py-3">{t('distribution.quantity')}</th>
                      <th className="px-4 py-3">{t('branchWarehouseOperator.approved')}</th>
                      <th className="px-4 py-3">{t('inventory.unit')}</th>
                      <th className="px-4 py-3">{t('distribution.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {request.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">{item.sku}</td>
                        <td className="px-4 py-3">{item.productName}</td>
                        <td className="px-4 py-3">{item.quantity}</td>
                        <td className="px-4 py-3">{item.approvedQuantity ?? '—'}</td>
                        <td className="px-4 py-3">{item.unit}</td>
                        <td className="px-4 py-3">
                          {item.lineStatus ? translateStatus(t, item.lineStatus, 'branchRequest') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </ProtectedShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
