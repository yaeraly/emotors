'use client';

import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';

type InvoiceReceipt = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: { id: string; fullName: string } | null;
  processedAt: string | null;
  invoiceStatus: string;
  paymentId: string;
};

type InvoiceReceiptResponse = {
  source: string;
  entityId: string;
  paymentId: string;
  invoiceNumber: string;
  invoiceStatus: string;
  processedAt: string | null;
  receipts: InvoiceReceipt[];
};

type Props = {
  source: 'SUPPLIER_PAYMENT' | 'TRANSPORT_EXPENSE' | 'FINANCE_TRANSFER';
  entityId: string;
  paymentId?: string;
  title?: string;
};

export function InvoiceReceiptHistoryPanel({ source, entityId, paymentId, title }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<InvoiceReceiptResponse | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ source, entityId });
    if (paymentId) params.set('paymentId', paymentId);
    apiFetch<InvoiceReceiptResponse>(`/procurement/invoice-receipts?${params.toString()}`)
      .then(setData)
      .catch(() => setData(null));
  }, [source, entityId, paymentId]);

  if (!data?.receipts?.length) return null;

  async function openReceipt(receiptId: string, fileUrl: string) {
    try {
      await apiFetch(`/procurement/invoice-receipts/${receiptId}/view`, { method: 'POST' });
    } catch {
      // View audit is best-effort; still allow download when authorized.
    }
    window.open(`${API_URL}${fileUrl}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">
        {title ?? t('procurement.invoiceReceipts.title')}
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.receipt')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.uploadedAt')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.uploadedBy')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.processedAt')}</th>
              <th className="px-3 py-2">{t('procurement.invoiceReceipts.invoiceStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {data.receipts.map((receipt) => (
              <tr key={receipt.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void openReceipt(receipt.id, receipt.fileUrl)}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {receipt.fileName}
                  </button>
                </td>
                <td className="px-3 py-2">{new Date(receipt.uploadedAt).toLocaleString()}</td>
                <td className="px-3 py-2">{receipt.uploadedBy?.fullName ?? '—'}</td>
                <td className="px-3 py-2">
                  {receipt.processedAt ? new Date(receipt.processedAt).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2">{receipt.invoiceStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
